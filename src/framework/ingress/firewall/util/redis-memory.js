/**
 * 防火墙访问层的**内存降级实现**（Redis 不可用时的等价状态）
 *
 * 为什么独立成文件：访问层每个域都是「Redis 路径 + 内存路径」成对实现，两套代码逐行相邻时
 * 读一个函数要在两种语义间来回切换，改 Redis 路径时也容易被内存分支误导。这里只放内存侧：
 * 表结构、惰性清理、各域的纯内存读写。访问层（util/redis.js）在 !redisAvailable() 时调用
 * 本文件，语义必须与 Redis 路径一致 —— 不一致就是「线上正常、Redis 一挂就行为改变」。
 *
 * 数据结构与 Redis 侧的对应关系：
 *   mem.blocks / blocksFp / blocksDev → block:*（JSON 元数据，永久条目用 permanent 标记）
 *   mem.whitelist*                    → whitelist:*（只有 expiresAt，无永久）
 *   mem.counters                      → trap:* / brute:*（固定窗口计数）
 *   mem.windows                       → rl:*（时间戳数组，滑动窗口）
 *   mem.passes                        → pass:*（挑战通过令牌）
 *   mem.flags                         → lock:*（账号锁定）
 *   mem.challenges                    → chal:*（挑战载荷，一次性消费）
 *
 * ⚠️ 这里是**进程内**状态：多实例部署下每实例各一份，Redis 恢复后不会补写，
 * 进程重启即丢失。这与「降级」的定位一致：宁可弱化，不做假的强一致。
 *
 * @author yijiu2025
 * @since 2026-11-02（自 util/redis.js 抽出，逻辑未改）
 */
import { dimOf, ID_BY_DIM } from './redis-keys.js';

// ============== 常量 ==============

/** 永久封禁的 Retry-After 兜底值（秒），与历史行为一致 */
const PERMANENT_RETRY_AFTER = 86400;

// ============== 状态表 ==============

/**
 * Redis 不可用时的内存状态。
 * 与 Redis 路径语义一致：临时条目按 expiresAt 惰性过期，永久条目用 permanent 标记。
 */
const mem = {
  blocks: new Map(),
  blocksFp: new Map(),
  blocksDev: new Map(),
  whitelist: new Map(),
  whitelistFp: new Map(),
  whitelistDev: new Map(),
  counters: new Map(),
  windows: new Map(),
  passes: new Map(),
  flags: new Map(),
  challenges: new Map()
};

// ============== 惰性清理 ==============

/** 惰性清理内存状态，防止长时间无 Redis 时无界增长 */
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweepMemory() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const map of [mem.blocks, mem.blocksFp, mem.blocksDev]) {
    for (const [k, v] of map) {
      if (!v.permanent && v.expiresAt && now > v.expiresAt) map.delete(k);
    }
  }
  for (const map of [mem.whitelist, mem.whitelistFp, mem.whitelistDev, mem.passes, mem.flags, mem.challenges]) {
    for (const [k, v] of map) {
      if (v.expiresAt && now > v.expiresAt) map.delete(k);
    }
  }
  for (const [k, v] of mem.counters) {
    if (v.expiresAt && now > v.expiresAt) mem.counters.delete(k);
  }
  for (const [k, list] of mem.windows) {
    if (!list.length || now - list[list.length - 1] > 300_000) mem.windows.delete(k);
  }
}

/**
 * 维度 → 内存表。与 redis.js 的 DIMS 一一对应（那边是键名，这边是表），
 * 两处都从 ID_BY_DIM 取「怎么从目标对象里取 id」，避免同一规则写两遍。
 */
const TABLES = {
  device: { block: mem.blocksDev, wl: mem.whitelistDev },
  fingerprint: { block: mem.blocksFp, wl: mem.whitelistFp },
  ip: { block: mem.blocks, wl: mem.whitelist }
};

// ============== 访问控制状态（内存侧） ==============

/**
 * 空访问状态（Redis 失败时的 fail-open 返回值；只有一处定义，避免两个调用点漂移）
 *
 * @returns {{devWhitelisted:boolean, fpWhitelisted:boolean, ipWhitelisted:boolean,
 *   devBlock:null, fpBlock:null, ipBlock:null}}
 */
function emptyAccessState() {
  return {
    devWhitelisted: false,
    fpWhitelisted: false,
    ipWhitelisted: false,
    devBlock: null,
    fpBlock: null,
    ipBlock: null
  };
}

/**
 * 内存版访问控制状态读取（维度与优先级同 Redis 版：设备 > 指纹 > IP）
 *
 * @param {{ip:string, fingerprint?:string, deviceId?:string}} params 目标
 * @returns {object} 与 readAccessState 同构的状态对象
 */
function readAccessStateFromMemory({ ip, fingerprint, deviceId }) {
  const now = Date.now();

  // 白名单：任一维度命中即短路
  if (takeLiveWhitelist('device', deviceId, now)) return { ...emptyAccessState(), devWhitelisted: true };
  if (takeLiveWhitelist('fingerprint', fingerprint, now)) return { ...emptyAccessState(), fpWhitelisted: true };
  if (takeLiveWhitelist('ip', ip, now)) return { ...emptyAccessState(), ipWhitelisted: true };

  return {
    ...emptyAccessState(),
    devBlock: blockEntryOf('device', deviceId, now),
    fpBlock: blockEntryOf('fingerprint', fingerprint, now),
    ipBlock: blockEntryOf('ip', ip, now)
  };
}

/**
 * 内存白名单条目是否有效；已过期的顺手删掉（与其它读取路径一致的惰性清理）
 *
 * @param {'device'|'fingerprint'|'ip'} dim 维度
 * @param {string} [id] 该维度的标识
 * @param {number} now 当前毫秒时间戳
 * @returns {boolean} 是否命中有效白名单
 */
function takeLiveWhitelist(dim, id, now) {
  if (!id) return false;
  const table = TABLES[dim].wl;
  const entry = table.get(id);
  if (!entry) return false;
  if (now <= entry.expiresAt) return true;
  table.delete(id);
  return false;
}

/**
 * 读内存封禁条目并转成统一结构
 *
 * @param {'device'|'fingerprint'|'ip'} dim 维度
 * @param {string} [id] 该维度的标识
 * @param {number} now 当前毫秒时间戳
 * @returns {{status:string, ttlSec:number}|null} 无该维度或无条目时为 null
 */
function blockEntryOf(dim, id, now) {
  if (!id) return null;
  return memoryBlockEntry(TABLES[dim].block.get(id), now);
}

/**
 * 内存封禁条目转统一结构（顺带清掉过期条目）
 *
 * @param {object|undefined} entry 内存条目
 * @param {number} now 当前毫秒时间戳
 * @returns {{status:string, ttlSec:number}|null}
 */
function memoryBlockEntry(entry, now) {
  if (!entry) return null;
  if (!entry.permanent && now > entry.expiresAt) return null;
  const ttlSec = entry.permanent ? PERMANENT_RETRY_AFTER : Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  return { status: entry.status || 'BLOCKED', ttlSec };
}

/**
 * 写内存封禁表
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 目标
 * @param {object} metadata 封禁元数据
 * @param {number} ttlSec 已归一化的 TTL 秒（0 = 永久）
 * @returns {void}
 */
function writeBlockToMemory(target, metadata, ttlSec) {
  sweepMemory();
  const dim = dimOf(target);
  TABLES[dim].block.set(ID_BY_DIM[dim](target), {
    status: metadata.status,
    // 自动封禁只发生在 IP 维度；设备/指纹维度由运维手动指定，缺省记为 manual
    source: metadata.source || (dim === 'ip' ? 'auto' : 'manual'),
    permanent: ttlSec === 0,
    expiresAt: ttlSec === 0 ? null : Date.now() + ttlSec * 1000
  });
}

/** 内存版列表（与 Redis 版返回结构一致） */
function listActiveFromMemory(kind) {
  sweepMemory();
  const now = Date.now();
  const isBlock = kind === 'block';
  const toEntries = table => {
    const out = [];
    for (const [field, entry] of table) {
      if (!entry.permanent && !(entry.expiresAt > now)) continue;
      out.push({
        field,
        meta: {
          status: entry.status,
          source: entry.source,
          permanent: Boolean(entry.permanent),
          expiresAt: entry.permanent ? null : entry.expiresAt
        }
      });
    }
    return out;
  };
  return {
    ip: toEntries(isBlock ? mem.blocks : mem.whitelist),
    fp: toEntries(isBlock ? mem.blocksFp : mem.whitelistFp),
    dev: toEntries(isBlock ? mem.blocksDev : mem.whitelistDev)
  };
}

/** 内存计数（固定窗口） */
function bumpCounterInMemory(keyRel, windowSec) {
  sweepMemory();
  const now = Date.now();
  const entry = mem.counters.get(keyRel);
  if (!entry || now > entry.expiresAt) {
    mem.counters.set(keyRel, { count: 1, expiresAt: now + windowSec * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * 按「相对 key」删除内存降级状态。
 *
 * 为什么需要：`removeKeys` 的入参是 `rel.*` 构造出的相对 key（`lock:bob`、`rl:xxx`、
 * `pass:1.2.3.4:tok` …），而内存表有两种键形态 —— counters/windows/passes/flags 按相对 key 存，
 * blocks/whitelist/blocksFp/whitelistFp 按裸 id 存。只删其中一半，就会出现
 * 「Redis 模式解锁干净、内存模式解锁后账号仍被锁定」这类只在降级路径复现的缺陷。
 *
 * @param {string} keyRel 相对 key
 * @returns {void}
 */
function memDeleteByRel(keyRel) {
  for (const map of [mem.counters, mem.windows, mem.passes, mem.flags]) map.delete(keyRel);

  // 前缀必须**长优先**匹配：`block:dev:x` 同时以 `block:` 开头，
  // 短前缀先命中会把设备维度条目错删进 IP 表（设备表条目残留、IP 表被垃圾写入）。
  const PREFIXED = [
    ['block:fp:', mem.blocksFp],
    ['block:dev:', mem.blocksDev],
    ['whitelist:fp:', mem.whitelistFp],
    ['whitelist:dev:', mem.whitelistDev]
  ];
  for (const [prefix, map] of PREFIXED) {
    if (keyRel.startsWith(prefix)) {
      map.delete(keyRel.slice(prefix.length));
      return;
    }
  }
  if (keyRel.startsWith('block:')) mem.blocks.delete(keyRel.slice('block:'.length));
  else if (keyRel.startsWith('whitelist:')) mem.whitelist.delete(keyRel.slice('whitelist:'.length));
}

/**
 * 重置全部内存状态（测试隔离用）
 *
 * @returns {void}
 */
function resetMemoryState() {
  for (const map of Object.values(mem)) map.clear();
  lastSweep = 0;
}

export {
  PERMANENT_RETRY_AFTER,
  mem,
  TABLES,
  sweepMemory,
  emptyAccessState,
  readAccessStateFromMemory,
  takeLiveWhitelist,
  blockEntryOf,
  memoryBlockEntry,
  writeBlockToMemory,
  listActiveFromMemory,
  bumpCounterInMemory,
  memDeleteByRel,
  resetMemoryState
};
