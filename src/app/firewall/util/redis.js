/**
 * firewall Redis 访问层
 *
 * 为什么需要这一层：firewall 过去把 `app.redis`（node-redis v5 裸客户端）在十个文件里传来传去，
 * 直接手写命令，于是踩到了三类问题：
 *   1. 命令名写错 —— node-redis v5 只认驼峰（hSet/hGetAll/hDel/zAdd…），写成 `hset`/`hgetall`
 *      一律 undefined，报错要么被 try/catch 吞掉（hash 索引静默写不进去），要么直接抛出（404 陷阱失效）。
 *   2. 不存在的 API —— `pipeline()` 是 ioredis 的写法，node-redis 只有 `multi()`；
 *      `eval(script, numKeys, key, arg)` 是旧签名，v5 要求 `eval(script, { keys, arguments })`。
 *   3. 没有超时/降级 —— 裸客户端单次调用可无限挂起，Redis 抖动直接拖慢请求。
 *
 * 本层把「机制」收拢成**语义操作**（读封禁状态、写封禁、滑窗计数…），全部落在框架
 * `getStore('fw')` 上：自动加 `fw:` 前缀、单次调用带超时、错误统一包装成
 * `RedisRequiredError`，并支持主备降级；Redis 不可用时同一套语义自动走内存实现，
 * 调用方不再需要 `if (!redisClient)` 分支。
 *
 * Redis key 布局保持不变（与历史数据兼容）：
 *   fw:block:{ip} / fw:block:fp:{fp} / fw:block:dev:{dev}          → JSON 元数据（临时封禁带 TTL，永久无 TTL）
 *   fw:whitelist:{ip} / fw:whitelist:fp:{fp} / fw:whitelist:dev:{dev} → '1'（带 TTL）
 *   fw:blocked:ips / fw:blocked:fps / fw:blocked:devices           → Hash 索引（field → JSON）
 *   fw:whitelisted:ips / fw:whitelisted:fps / fw:whitelisted:devices → Hash 索引（field → JSON）
 *   fw:rl:{actor} / fw:trap:{ip} / fw:brute:ip:{ip} / fw:brute:user:{u} / fw:lock:{u}
 *   fw:pass:{ip}:{token} / fw:pass:fp:{fp}:{token} / fw:pass:dev:{dev}:{token}
 *
 * 三个维度（`ip` / `fingerprint` / `deviceId`）共用同一套语义操作，靠 `DIMS` 描述表
 * 分派；新增维度只需在 `DIMS` 与 `rel`/`HASH` 各加一条，业务分支不必再分三份写。
 *
 * 为什么要有 `deviceId` 维度：`fingerprint` 的输入含 IP（换 IP 即变），而 deviceId 由
 * auth 的结构化设备 ID 流程签发、与 IP 无关 —— 它是本模块唯一能跨 IP 追踪的身份。
 * 强度边界见 `dao/block-manager.js` 的 `setBlockForSubject` 注释（客户端可弃用换新）。
 *
 * @author yijiu2025
 * @since 2026-09-15
 */
import { getStore, isRedisReady } from '../../../framework/redis/index.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.util.redis');

/** 命名空间：getStore 自动加 `fw:` 前缀，store.* 方法传相对 key */
const NS = 'fw';

/** 单次 Redis 操作超时（毫秒）。防火墙在请求路径上，宁可快速降级也不拖慢请求 */
const OP_TIMEOUT_MS = 2000;

/** 永久封禁的 Retry-After 兜底值（秒），与历史行为一致 */
const PERMANENT_RETRY_AFTER = 86400;

/**
 * 惰性取 store。
 *
 * 不能在模块顶层调用：redis 插件是异步注册的，模块被 import 时 `globalRedis` 可能还没建立，
 * 那时 `getStore` 会按「Redis 未配置」一路走到 MapStore（或在已配置时抛 RedisRequiredError）。
 * getStore 内部按 prefix+timeout 缓存实例，此处每次调用开销只是一个 Map 查找。
 *
 * @returns {object} 前缀绑定的 store（Redis 或 MapStore，由框架按配置选择）
 */
function store() {
  return getStore(NS, { timeout: OP_TIMEOUT_MS });
}

/** 相对 key → 完整 Redis key（仅在需要绕过 store 前缀、直接给 Lua 传 KEYS 时使用） */
function full(relKey) {
  return `${NS}:${relKey}`;
}

/** 当前是否真的能用 Redis（已配置 + 已连接）；否则走内存实现 */
function redisAvailable() {
  return isRedisReady();
}

// ============== Lua 脚本 ==============

/**
 * 一次往返读取全部访问控制状态（三个维度：设备 / 指纹 / IP）。
 * KEYS: [1] 设备白名单 [2] 指纹白名单 [3] IP 白名单 [4] 设备封禁 [5] 指纹封禁 [6] IP 封禁
 * ARGV: [1] '1'/'0' 是否带指纹 [2] '1'/'0' 是否带设备 ID
 * 返回: { 设备白名单, 指纹白名单, IP白名单, 设备封禁原文, 设备PTTL, 指纹封禁原文, 指纹PTTL, IP封禁原文, IPPTTL }
 *
 * 白名单命中即短路（与旧逻辑一致：白名单优先级最高，命中后不再查封禁）。
 * 设备维度排在指纹之前：它比「IP+请求头」更精确，命中信息更能说明问题。
 */
const LUA_READ_ACCESS_STATE = `
local hasFp = ARGV[1] == '1'
local hasDev = ARGV[2] == '1'
if hasDev and redis.call('EXISTS', KEYS[1]) == 1 then
  return { 1, 0, 0, false, -2, false, -2, false, -2 }
end
if hasFp and redis.call('EXISTS', KEYS[2]) == 1 then
  return { 0, 1, 0, false, -2, false, -2, false, -2 }
end
if redis.call('EXISTS', KEYS[3]) == 1 then
  return { 0, 0, 1, false, -2, false, -2, false, -2 }
end
local devVal = false
local devTtl = -2
if hasDev then
  devVal = redis.call('GET', KEYS[4])
  if devVal then devTtl = redis.call('PTTL', KEYS[4]) end
end
local fpVal = false
local fpTtl = -2
if hasFp then
  fpVal = redis.call('GET', KEYS[5])
  if fpVal then fpTtl = redis.call('PTTL', KEYS[5]) end
end
local ipVal = redis.call('GET', KEYS[6])
local ipTtl = -2
if ipVal then ipTtl = redis.call('PTTL', KEYS[6]) end
return { 0, 0, 0, devVal or false, devTtl, fpVal or false, fpTtl, ipVal or false, ipTtl }
`;

/**
 * 写入封禁：SET 封禁键（可带 TTL）+ HSET 索引，一次往返完成，避免「键写进去了但列表查不到」。
 * KEYS: [1] 封禁键 [2] 索引 Hash
 * ARGV: [1] JSON 值 [2] TTL 秒（0 = 永久，不带 TTL）[3] Hash field
 */
const LUA_WRITE_BLOCK = `
if tonumber(ARGV[2]) > 0 then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
else
  redis.call('SET', KEYS[1], ARGV[1])
end
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
return 1
`;

/**
 * 写入白名单：SET（带 TTL）+ HSET 索引。
 * KEYS: [1] 白名单键 [2] 索引 Hash
 * ARGV: [1] JSON 值 [2] TTL 秒 [3] Hash field
 */
const LUA_WRITE_WHITELIST = `
redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[2]))
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
return 1
`;

/**
 * 移除访问控制条目：DEL 键 + HDEL 索引 field。
 * KEYS: [1] 键 [2] 索引 Hash
 * ARGV: [1] Hash field
 */
const LUA_REMOVE_ENTRY = `
redis.call('DEL', KEYS[1])
redis.call('HDEL', KEYS[2], ARGV[1])
return 1
`;

/**
 * 滑窗限频：清理窗口外成员 + 记录本次 + 计数 + 续期，一次往返且原子。
 * 旧实现是 4 条命令的 pipeline（且 `pipeline()` 在 node-redis 下根本不存在），
 * 并发下「先计数后写入」还会出现窗口漂移。
 * KEYS: [1] 窗口 key
 * ARGV: [1] now(ms) [2] windowMs [3] member [4] 窗口 key TTL(ms)
 * 返回: 窗口内请求数
 */
const LUA_RATE_WINDOW = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, tonumber(ARGV[1]) - tonumber(ARGV[2]))
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]))
return redis.call('ZCARD', KEYS[1])
`;

/**
 * 计数 + 首次设置过期（替代旧共享 Lua）：原子，避免 incr 成功但 expire 没执行导致 key 永不过期。
 * KEYS: [1] 计数 key
 * ARGV: [1] 窗口秒
 */
const LUA_INCR_WITH_EXPIRE = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

/**
 * 签发挑战通过令牌：按「设备 / 指纹 / IP」同时写最多三个键（一次往返）。
 * KEYS: [1] 设备键 [2] 指纹键（无该维度时传哨兵键）[3] IP 键
 * ARGV: [1] '1'/'0' 是否带设备 ID [2] '1'/'0' 是否带指纹 [3] TTL 秒
 */
const LUA_GRANT_PASS = `
if ARGV[1] == '1' then redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[3])) end
if ARGV[2] == '1' then redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3])) end
redis.call('SET', KEYS[3], '1', 'EX', tonumber(ARGV[3]))
return 1
`;

/**
 * 校验挑战通过令牌：三个键任一存在即通过，一次往返。
 * KEYS: [1] 设备键 [2] 指纹键（无该维度时传哨兵键）[3] IP 键
 * ARGV: [1] '1'/'0' 是否带设备 ID [2] '1'/'0' 是否带指纹
 */
const LUA_HAS_PASS = `
if ARGV[1] == '1' and redis.call('EXISTS', KEYS[1]) == 1 then return 1 end
if ARGV[2] == '1' and redis.call('EXISTS', KEYS[2]) == 1 then return 1 end
if redis.call('EXISTS', KEYS[3]) == 1 then return 1 end
return 0
`;

/**
 * 取走（读出并删除）挑战载荷：GET + DEL 必须原子，否则并发下同一 challengeId
 * 可以被重放两次 —— 「单次有效」的承诺就落空了。
 * KEYS: [1] 挑战 key
 * 返回: 载荷字符串；不存在返回 false
 */
const LUA_TAKE_CHALLENGE = `
local payload = redis.call('GET', KEYS[1])
if payload then redis.call('DEL', KEYS[1]) end
return payload
`;

/** 无指纹时给 KEYS 占位，保证 Lua 中 KEYS 数量恒定（避免 nil 索引） */
const KEY_SENTINEL = '_none';

// ============== Key 构造（相对，store 会加 fw: 前缀） ==============

const rel = {
  block: id => `block:${id}`,
  blockFp: fp => `block:fp:${fp}`,
  blockDevice: dev => `block:dev:${dev}`,
  whitelist: id => `whitelist:${id}`,
  whitelistFp: fp => `whitelist:fp:${fp}`,
  whitelistDevice: dev => `whitelist:dev:${dev}`,
  rateLimit: actor => `rl:${actor}`,
  trap: ip => `trap:${ip}`,
  bruteIp: ip => `brute:ip:${ip}`,
  bruteUser: user => `brute:user:${user}`,
  accountLock: user => `lock:${user}`,
  passIp: (ip, token) => `pass:${ip}:${token}`,
  passFp: (fp, token) => `pass:fp:${fp}:${token}`,
  passDevice: (dev, token) => `pass:dev:${dev}:${token}`,
  // 挑战载荷（服务端持有）：{ip, fingerprint, deviceId, salt, difficulty}，一次性消费
  challenge: id => `chal:${id}`
};

const HASH = {
  blockedIps: 'blocked:ips',
  blockedFps: 'blocked:fps',
  blockedDevices: 'blocked:devices',
  whitelistedIps: 'whitelisted:ips',
  whitelistedFps: 'whitelisted:fps',
  whitelistedDevices: 'whitelisted:devices'
};

/**
 * 维度分派表：把某个身份维度在 Redis 与内存两条路径上要用到的名字集中到一处。
 *
 * 为什么需要它：三个维度的读写逻辑完全同构，差别只在 key 名、索引名与内存表。
 * 旧版把 `isFp ? A : B` 的三元表达式散在 6 个函数里，加第三个维度时每处都要改，
 * 漏一处就退化成「写得进去但读不出来」——本仓出现过同款事故（索引没写导致列表永远为空）。
 *
 * @type {Record<'device'|'fingerprint'|'ip', object>}
 */
const DIMS = {
  device: {
    id: t => t.deviceId,
    keyRel: rel.blockDevice,
    hashRel: HASH.blockedDevices,
    wlKeyRel: rel.whitelistDevice,
    wlHashRel: HASH.whitelistedDevices,
    // 内存表用 thunk 取：DIMS 在 mem 之前定义，直接取值会拿到 undefined
    blockMem: () => mem.blocksDev,
    wlMem: () => mem.whitelistDev
  },
  fingerprint: {
    id: t => t.fingerprint,
    keyRel: rel.blockFp,
    hashRel: HASH.blockedFps,
    wlKeyRel: rel.whitelistFp,
    wlHashRel: HASH.whitelistedFps,
    blockMem: () => mem.blocksFp,
    wlMem: () => mem.whitelistFp
  },
  ip: {
    id: t => t.ip,
    keyRel: rel.block,
    hashRel: HASH.blockedIps,
    wlKeyRel: rel.whitelist,
    wlHashRel: HASH.whitelistedIps,
    blockMem: () => mem.blocks,
    wlMem: () => mem.whitelist
  }
};

/**
 * 解析目标身份属于哪个维度（优先级：设备 > 指纹 > IP，最精确者胜）
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 目标
 * @returns {'device'|'fingerprint'|'ip'} 维度名
 */
function dimOf(target) {
  if (target?.deviceId) return 'device';
  if (target?.fingerprint) return 'fingerprint';
  return 'ip';
}

// ============== 内存降级实现 ==============

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

// ============== 封禁 / 白名单 ==============

/**
 * 读取访问控制状态（白名单优先，命中即短路）
 *
 * 三个维度都参与判定：设备 / 指纹 / IP。缺少某个维度时给 Lua 传哨兵键
 * （Lua 里按 ARGV 的 '1'/'0' 决定是否去看它），仍是一次往返。
 *
 * @param {object} params
 * @param {string} params.ip 客户端 IP
 * @param {string} [params.fingerprint] 请求指纹
 * @param {string} [params.deviceId] 设备 ID（auth 结构化设备 ID，与 IP 无关）
 * @returns {Promise<{devWhitelisted:boolean, fpWhitelisted:boolean, ipWhitelisted:boolean,
 *   devBlock:{status:string,ttlSec:number}|null, fpBlock:{status:string,ttlSec:number}|null,
 *   ipBlock:{status:string,ttlSec:number}|null}>}
 */
async function readAccessState({ ip, fingerprint, deviceId }) {
  if (!redisAvailable()) return readAccessStateFromMemory({ ip, fingerprint, deviceId });
  try {
    const hasFp = fingerprint ? '1' : '0';
    const hasDev = deviceId ? '1' : '0';
    const keys = [
      full(deviceId ? rel.whitelistDevice(deviceId) : KEY_SENTINEL),
      full(fingerprint ? rel.whitelistFp(fingerprint) : KEY_SENTINEL),
      full(rel.whitelist(ip)),
      full(deviceId ? rel.blockDevice(deviceId) : KEY_SENTINEL),
      full(fingerprint ? rel.blockFp(fingerprint) : KEY_SENTINEL),
      full(rel.block(ip))
    ];
    const res = await store().call(client => client.eval(LUA_READ_ACCESS_STATE, { keys, arguments: [hasFp, hasDev] }));
    return {
      devWhitelisted: Number(res[0]) === 1,
      fpWhitelisted: Number(res[1]) === 1,
      ipWhitelisted: Number(res[2]) === 1,
      devBlock: decodeBlockEntry(res[3], res[4]),
      fpBlock: decodeBlockEntry(res[5], res[6]),
      ipBlock: decodeBlockEntry(res[7], res[8])
    };
  } catch (err) {
    // 失败即当作「无任何状态」，保持历史 fail-open 语义（不可因 Redis 抖动把所有人拦死）
    log.warn('readAccessState Redis 失败，按无状态处理', err);
    return emptyAccessState();
  }
}

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
 * 解析封禁原文 + PTTL 为统一结构
 *
 * @param {string|false|null} raw 封禁原文（JSON 或旧格式字符串）
 * @param {number} pttlMs PTTL 毫秒（-1 永久，-2 不存在）
 * @returns {{status:string, ttlSec:number}|null}
 */
function decodeBlockEntry(raw, pttlMs) {
  if (!raw) return null;
  const ttlMs = Number(pttlMs);
  // -1 = 键存在但无 TTL（永久封禁）；旧代码对永久封禁统一给 24h 的 Retry-After
  const ttlSec = ttlMs < 0 ? PERMANENT_RETRY_AFTER : Math.max(1, Math.ceil(ttlMs / 1000));
  return { status: decodeStatus(raw), ttlSec };
}

/**
 * 从封禁原文解出状态码（兼容旧格式纯字符串 + 新格式 JSON）
 *
 * @param {string} raw 封禁原文
 * @returns {string} 形如 'BLOCKED' / 'SCANNER' / 'CHALLENGE'
 */
function decodeStatus(raw) {
  const text = String(raw);
  if (!text.startsWith('{')) return text;
  try {
    return JSON.parse(text).status || 'BLOCKED';
  } catch {
    return text;
  }
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
  const table = DIMS[dim].wlMem();
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
  return memoryBlockEntry(DIMS[dim].blockMem().get(id), now);
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
 * 写入封禁（Redis：SET + HSET 原子双写；内存：写内存表）
 *
 * `target` 的三选一由 `dimOf` 决定（设备 > 指纹 > IP），这里不重复判断。
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 封禁目标
 * @param {object} metadata 封禁元数据（status/source/permanent/createdAt/expiresAt）
 * @returns {Promise<void>}
 */
async function writeBlock(target, metadata) {
  const value = JSON.stringify(metadata);
  const dim = dimOf(target);
  const id = DIMS[dim].id(target);
  // TTL 先归一化，Redis 与内存两条路径共用，避免两边对非法 expiresAt 的解释不一致
  const ttlSec = resolveBlockTtl(metadata, dim, id);

  if (!redisAvailable()) {
    writeBlockToMemory(target, metadata, ttlSec);
    return;
  }
  try {
    await store().call(client =>
      client.eval(LUA_WRITE_BLOCK, {
        keys: [full(DIMS[dim].keyRel(id)), full(DIMS[dim].hashRel)],
        arguments: [value, String(ttlSec), id]
      })
    );
  } catch (err) {
    log.warn('writeBlock Redis 失败，降级到内存', err);
    writeBlockToMemory(target, metadata, ttlSec);
  }
}

/** 临时封禁的兜底 TTL（秒）：元数据缺失/非法时用它，避免「临时封禁意外变永久」 */
const FALLBACK_BLOCK_TTL = 60;

/**
 * 计算封禁 TTL（秒），0 表示永久。
 *
 * 防御点：调用方若传了不含 `expiresAt` 的元数据（历史上 auto-responder 传的是
 * `{ reason, duration }`），旧实现会算出 `Math.max(1, NaN)` = NaN，`SET ... EX NaN` 抛错；
 * 一旦忽略错误直接不带 TTL 写，临时封禁就变成**永久封禁**。这里显式兜底到 60 秒并告警。
 *
 * @param {object} metadata 封禁元数据
 * @param {string} kind 目标维度（日志用）：'device' | 'fingerprint' | 'ip'
 * @param {string} id 目标值
 * @returns {number} TTL 秒（0 = 永久）
 */
function resolveBlockTtl(metadata, kind, id) {
  if (metadata.permanent) return 0;
  const expiresAt = Number(metadata.expiresAt);
  const remainMs = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || remainMs <= 0) {
    log.warn(`封禁元数据缺少有效 expiresAt（${kind}=${id}），按 ${FALLBACK_BLOCK_TTL}s 临时封禁兜底`);
    return FALLBACK_BLOCK_TTL;
  }
  return Math.max(1, Math.ceil(remainMs / 1000));
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
  DIMS[dim].blockMem().set(DIMS[dim].id(target), {
    status: metadata.status,
    // 自动封禁只发生在 IP 维度；设备/指纹维度由运维手动指定，缺省记为 manual
    source: metadata.source || (dim === 'ip' ? 'auto' : 'manual'),
    permanent: ttlSec === 0,
    expiresAt: ttlSec === 0 ? null : Date.now() + ttlSec * 1000
  });
}

/**
 * 移除封禁（Redis：DEL + HDEL 原子；内存：删表）
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 目标
 * @returns {Promise<void>}
 */
async function removeBlock(target) {
  const dim = dimOf(target);
  const id = DIMS[dim].id(target);
  DIMS[dim].blockMem().delete(id);
  if (!redisAvailable()) return;
  try {
    await store().call(client =>
      client.eval(LUA_REMOVE_ENTRY, {
        keys: [full(DIMS[dim].keyRel(id)), full(DIMS[dim].hashRel)],
        arguments: [id]
      })
    );
  } catch (err) {
    log.warn('removeBlock Redis 失败', err);
  }
}

/** 白名单默认有效期（秒）：入参非法时兜底，避免 NaN TTL 导致 SET 静默失败 */
const DEFAULT_WHITELIST_TTL = 86400;

/**
 * 归一化有效期入参。
 *
 * 历史缺陷：导入接口把「对象」直接当 durationSeconds 传进来（`setWhitelist(ip, { duration })`），
 * 于是 `Date.now() + {} * 1000` = NaN，`SET ... EX NaN` 抛错 → 白名单**静默写不进去**。
 * 这里统一兜底：非法值退回 24 小时，只接受正整数秒。Redis 与内存两条路径共用，
 * 保证两边对同一入参的解释一致。
 *
 * @param {number|string|object} value 调用方传入的有效期
 * @returns {number} 合法的秒数（正整数）
 */
function normalizeDuration(value) {
  const n =
    typeof value === 'object' && value !== null ? Number(value.duration ?? value.durationSeconds) : Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_WHITELIST_TTL;
  return Math.ceil(n);
}

/**
 * 写入白名单
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 目标
 * @param {number|string|object} durationSeconds 有效期（秒），非法值自动兜底
 * @returns {Promise<void>}
 */
async function writeWhitelist(target, durationSeconds) {
  const dim = dimOf(target);
  const id = DIMS[dim].id(target);
  const ttlSec = normalizeDuration(durationSeconds);
  const expiresAt = Date.now() + ttlSec * 1000;
  const value = JSON.stringify({ expiresAt });

  if (!redisAvailable()) {
    sweepMemory();
    DIMS[dim].wlMem().set(id, { expiresAt });
    return;
  }
  try {
    await store().call(client =>
      client.eval(LUA_WRITE_WHITELIST, {
        keys: [full(DIMS[dim].wlKeyRel(id)), full(DIMS[dim].wlHashRel)],
        arguments: [value, String(ttlSec), id]
      })
    );
  } catch (err) {
    log.warn('writeWhitelist Redis 失败', err);
  }
}

/**
 * 移除白名单
 *
 * @param {{ip?:string, fingerprint?:string, deviceId?:string}} target 目标
 * @returns {Promise<void>}
 */
async function removeWhitelist(target) {
  const dim = dimOf(target);
  const id = DIMS[dim].id(target);
  DIMS[dim].wlMem().delete(id);
  if (!redisAvailable()) return;
  try {
    await store().call(client =>
      client.eval(LUA_REMOVE_ENTRY, {
        keys: [full(DIMS[dim].wlKeyRel(id)), full(DIMS[dim].wlHashRel)],
        arguments: [id]
      })
    );
  } catch (err) {
    log.warn('removeWhitelist Redis 失败', err);
  }
}

/**
 * 列出活跃封禁/白名单条目（已过滤过期项，并顺带清理 Redis 索引中的过期 field）
 *
 * 优化点：旧实现是「HGETALL + 对每个过期条目一次 HDEL」——读一次列表会发出 N 次写。
 * 现在读只发一次 HGETALL，清理合并成一次 HDEL，且只在确实存在过期项时才发。
 *
 * 三个维度各一个索引 Hash，三次 HGETALL 并发发出。
 *
 * @param {'block'|'whitelist'} kind 类型
 * @returns {Promise<{ip:Array<object>, fp:Array<object>, dev:Array<object>}>} 未过期的条目（meta 原样返回）
 */
async function listActive(kind) {
  const isBlock = kind === 'block';

  if (!redisAvailable()) return listActiveFromMemory(kind);

  try {
    const [ipEntries, fpEntries, devEntries] = await Promise.all([
      readHashEntries(isBlock ? HASH.blockedIps : HASH.whitelistedIps, isBlock),
      readHashEntries(isBlock ? HASH.blockedFps : HASH.whitelistedFps, isBlock),
      readHashEntries(isBlock ? HASH.blockedDevices : HASH.whitelistedDevices, isBlock)
    ]);
    return { ip: ipEntries, fp: fpEntries, dev: devEntries };
  } catch (err) {
    log.warn('listActive Redis 失败，仅返回内存条目', err);
    return listActiveFromMemory(kind);
  }
}

/**
 * 读一个索引 Hash 并过滤过期项；过期 field 合并成一次 HDEL 清理
 *
 * @param {string} hashRel 相对 hash key
 * @param {boolean} isBlock 是否封禁索引（决定过期判定依据 permanent/expiresAt）
 * @returns {Promise<Array<object>>} 未过期条目数组
 */
async function readHashEntries(hashRel, isBlock) {
  const raw = await store().hgetall(hashRel);
  if (!raw) return [];
  const now = Date.now();
  const alive = [];
  const expired = [];
  for (const [field, json] of Object.entries(raw)) {
    let meta;
    try {
      meta = JSON.parse(json);
    } catch {
      continue; // 格式异常的条目跳过（不删，避免误清历史数据）
    }
    // 白名单无 permanent 概念，统一按 expiresAt 判定
    const permanent = isBlock ? Boolean(meta.permanent) : false;
    if (!permanent && !(meta.expiresAt > now)) {
      expired.push(field);
      continue;
    }
    alive.push({ field, meta });
  }
  if (expired.length) {
    const hashFull = full(hashRel);
    await store()
      .call(client => client.hDel(hashFull, expired))
      .catch(err => log.warn('清理过期索引失败', err));
  }
  return alive;
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

// ============== 计数 / 滑窗限频 ==============

/**
 * 计数 + 首次设置过期（原子）
 *
 * @param {string} keyRel 相对 key（如 `brute:ip:1.2.3.4`）
 * @param {number} windowSec 窗口秒
 * @returns {Promise<number>} 当前计数
 */
async function bumpCounter(keyRel, windowSec) {
  if (!redisAvailable()) return bumpCounterInMemory(keyRel, windowSec);
  try {
    return Number(
      await store().call(client =>
        client.eval(LUA_INCR_WITH_EXPIRE, { keys: [full(keyRel)], arguments: [String(windowSec)] })
      )
    );
  } catch (err) {
    log.warn('bumpCounter Redis 失败，降级内存计数', err);
    return bumpCounterInMemory(keyRel, windowSec);
  }
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
 * 读取计数（不递增）
 *
 * @param {string} keyRel 相对 key
 * @returns {Promise<number>} 计数，不存在返回 0
 */
async function readCounter(keyRel) {
  if (!redisAvailable()) return mem.counters.get(keyRel)?.count || 0;
  try {
    const raw = await store().get(keyRel);
    return Number(raw) || 0;
  } catch (err) {
    log.warn('readCounter Redis 失败', err);
    return mem.counters.get(keyRel)?.count || 0;
  }
}

/**
 * 删除若干计数 key（登录成功时清零失败计数）
 *
 * @param {string[]} keysRel 相对 key 数组
 * @returns {Promise<void>}
 */
async function removeCounters(keysRel) {
  for (const k of keysRel) mem.counters.delete(k);
  if (!keysRel.length || !redisAvailable()) return;
  try {
    await store().call(client => client.del(keysRel.map(full)));
  } catch (err) {
    log.warn('removeCounters Redis 失败', err);
  }
}

/**
 * 滑窗计数：清理窗口外记录 → 记录本次 → 返回窗口内总数（一次往返，原子）
 *
 * @param {string} keyRel 相对 key（如 `rl:/api/order:1.2.3.4`）
 * @param {number} windowMs 窗口毫秒
 * @returns {Promise<number>} 窗口内请求数（含本次）
 */
async function consumeRateWindow(keyRel, windowMs) {
  const now = Date.now();
  if (!redisAvailable()) return consumeRateWindowInMemory(keyRel, windowMs, now);
  try {
    return Number(
      await store().call(client =>
        client.eval(LUA_RATE_WINDOW, {
          keys: [full(keyRel)],
          arguments: [
            String(now),
            String(windowMs),
            `${now}:${Math.random().toString(36).slice(2, 8)}`,
            String(windowMs + 5000)
          ]
        })
      )
    );
  } catch (err) {
    log.warn('consumeRateWindow Redis 失败，降级内存滑窗', err);
    return consumeRateWindowInMemory(keyRel, windowMs, now);
  }
}

/** 内存滑窗计数（数组时间戳，与旧 memorySlidingWindow 同语义） */
function consumeRateWindowInMemory(keyRel, windowMs, now) {
  sweepMemory();
  const start = now - windowMs;
  const list = mem.windows.get(keyRel) || [];
  while (list.length && list[0] < start) list.shift();
  list.push(now);
  mem.windows.set(keyRel, list);
  return list.length;
}

// ============== 挑战通过令牌 ==============

/**
 * 由三个维度拼出通过令牌的键（缺哪个维度就给哨兵键）
 *
 * @param {{ip:string, fingerprint?:string, deviceId?:string}} params 目标
 * @param {string} token 令牌
 * @returns {string[]} [设备键, 指纹键, IP 键]
 */
function passKeys({ ip, fingerprint, deviceId }, token) {
  return [
    full(deviceId ? rel.passDevice(deviceId, token) : KEY_SENTINEL),
    full(fingerprint ? rel.passFp(fingerprint, token) : KEY_SENTINEL),
    full(rel.passIp(ip, token))
  ];
}

/**
 * 签发挑战通过令牌（设备 / 指纹 / IP 三个维度，一次往返）
 *
 * 三个维度都写：任一维度在后续请求里仍能对上即可放行。设备维度最有价值 ——
 * 用户换网络（Wi-Fi ↔ 蜂窝）后 IP 变了，指纹也跟着变（指纹含 IP），
 * 只有设备 ID 不变，不必再做一次人机验证。
 *
 * @param {object} params
 * @param {string} params.ip 客户端 IP
 * @param {string} [params.fingerprint] 请求指纹
 * @param {string} [params.deviceId] 设备 ID
 * @param {string} params.token 令牌
 * @param {number} params.ttlSec 有效期（秒）
 * @returns {Promise<void>}
 */
async function grantPass({ ip, fingerprint, deviceId, token, ttlSec }) {
  if (!redisAvailable()) {
    sweepMemory();
    const expiresAt = Date.now() + ttlSec * 1000;
    if (deviceId) mem.passes.set(rel.passDevice(deviceId, token), { expiresAt });
    if (fingerprint) mem.passes.set(rel.passFp(fingerprint, token), { expiresAt });
    mem.passes.set(rel.passIp(ip, token), { expiresAt });
    return;
  }
  try {
    await store().call(client =>
      client.eval(LUA_GRANT_PASS, {
        keys: passKeys({ ip, fingerprint, deviceId }, token),
        arguments: [deviceId ? '1' : '0', fingerprint ? '1' : '0', String(ttlSec)]
      })
    );
  } catch (err) {
    log.warn('grantPass Redis 失败', err);
  }
}

/**
 * 校验挑战通过令牌（三个维度任一命中即通过，一次往返）
 *
 * @param {object} params
 * @param {string} params.ip 客户端 IP
 * @param {string} [params.fingerprint] 请求指纹
 * @param {string} [params.deviceId] 设备 ID
 * @param {string} params.token 令牌
 * @returns {Promise<boolean>} 是否已通过挑战
 */
async function hasPass({ ip, fingerprint, deviceId, token }) {
  if (!redisAvailable()) {
    sweepMemory();
    const now = Date.now();
    const hit = k => {
      const v = mem.passes.get(k);
      return Boolean(v && v.expiresAt > now);
    };
    return (
      (deviceId ? hit(rel.passDevice(deviceId, token)) : false) ||
      (fingerprint ? hit(rel.passFp(fingerprint, token)) : false) ||
      hit(rel.passIp(ip, token))
    );
  }
  try {
    const res = await store().call(client =>
      client.eval(LUA_HAS_PASS, {
        keys: passKeys({ ip, fingerprint, deviceId }, token),
        arguments: [deviceId ? '1' : '0', fingerprint ? '1' : '0']
      })
    );
    return Number(res) === 1;
  } catch (err) {
    log.warn('hasPass Redis 失败，按未通过处理', err);
    return false;
  }
}

/**
 * 写入布尔标记（如账号锁定 `fw:lock:{user}`），走框架 KV 接口：自动前缀 + 超时 + 序列化
 *
 * @param {string} keyRel 相对 key
 * @param {number} ttlSec 有效期（秒）
 * @returns {Promise<void>}
 */
async function setFlag(keyRel, ttlSec) {
  if (!redisAvailable()) {
    sweepMemory();
    mem.flags.set(keyRel, { expiresAt: Date.now() + ttlSec * 1000 });
    return;
  }
  try {
    await store().set(keyRel, '1', ttlSec);
  } catch (err) {
    log.warn('setFlag Redis 失败，降级内存', err);
    mem.flags.set(keyRel, { expiresAt: Date.now() + ttlSec * 1000 });
  }
}

/**
 * 读取布尔标记是否存在
 *
 * @param {string} keyRel 相对 key
 * @returns {Promise<boolean>} 是否存在且未过期
 */
async function hasFlag(keyRel) {
  if (!redisAvailable()) {
    const entry = mem.flags.get(keyRel);
    return Boolean(entry && entry.expiresAt > Date.now());
  }
  try {
    return Boolean(await store().get(keyRel));
  } catch (err) {
    log.warn('hasFlag Redis 失败', err);
    return false;
  }
}

// ============== 通用 ==============

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

  const FP_BLOCK = 'block:fp:';
  const FP_WHITELIST = 'whitelist:fp:';
  if (keyRel.startsWith(FP_BLOCK)) mem.blocksFp.delete(keyRel.slice(FP_BLOCK.length));
  else if (keyRel.startsWith('block:')) mem.blocks.delete(keyRel.slice('block:'.length));
  else if (keyRel.startsWith(FP_WHITELIST)) mem.whitelistFp.delete(keyRel.slice(FP_WHITELIST.length));
  else if (keyRel.startsWith('whitelist:')) mem.whitelist.delete(keyRel.slice('whitelist:'.length));
}

/**
 * 删除若干 key（如解封后清理残留计数/锁定标记）
 *
 * @param {string[]} keysRel 相对 key 数组
 * @returns {Promise<void>}
 */
async function removeKeys(keysRel) {
  if (!keysRel.length) return;
  for (const k of keysRel) memDeleteByRel(k);
  if (!redisAvailable()) return;
  try {
    await store().call(client => client.del(keysRel.map(full)));
  } catch (err) {
    log.warn('removeKeys Redis 失败', err);
  }
}

/**
 * 按模式扫描 key（自动加 fw: 前缀），返回**相对 key** 列表
 *
 * @param {string} patternRel 相对模式（如 `block:*`）
 * @param {number} [limit] 最多返回条数（防御性上限）
 * @returns {Promise<string[]>} 相对 key 数组
 */
async function scanKeys(patternRel, limit = 10_000) {
  if (!redisAvailable()) return [];
  const out = [];
  try {
    let cursor = '0';
    do {
      const res = await store().scan(cursor, { MATCH: patternRel, COUNT: 100 });
      cursor = String(res.cursor);
      for (const k of res.keys || []) {
        out.push(k.startsWith(`${NS}:`) ? k.slice(NS.length + 1) : k);
        if (out.length >= limit) return out;
      }
    } while (cursor !== '0');
  } catch (err) {
    log.warn('scanKeys Redis 失败', err);
  }
  return out;
}

/**
 * 写入 Hash 索引条目（迁移旧格式封禁键时补索引）
 *
 * @param {string} field Hash field（IP 或指纹）
 * @param {string} fieldValue 已序列化的 JSON 值
 * @param {string} [hashRel] 相对 hash key，默认封禁 IP 索引
 * @returns {Promise<void>}
 */
async function addBlockIndexEntry(field, fieldValue, hashRel = HASH.blockedIps) {
  if (!redisAvailable()) return;
  const hash = full(hashRel);
  try {
    await store().call(client => client.hSet(hash, field, fieldValue));
  } catch (err) {
    log.warn('addBlockIndexEntry Redis 失败', err);
  }
}

/**
 * 读取原始字符串值（不做 JSON 解析，供旧数据迁移判断格式用）
 *
 * @param {string} keyRel 相对 key
 * @returns {Promise<string|null>} 原始值，不存在返回 null
 */
async function getRaw(keyRel) {
  if (!redisAvailable()) return null;
  try {
    // 注意：这里不能走 store().get() —— 框架 store 的 get 会 safeParse，
    // 返回的是**对象**而不是字符串，会让调用方的 `raw.startsWith('{')`
    // 直接抛 TypeError。本函数承诺「原始字符串」，必须用底层 GET。
    return await store().call(client => client.get(full(keyRel)));
  } catch (err) {
    log.warn('getRaw Redis 失败', err);
    return null;
  }
}

/**
 * 读取 key 剩余 TTL（秒）
 *
 * @param {string} keyRel 相对 key
 * @returns {Promise<number>} TTL 秒；-1 永久，-2 不存在
 */
async function ttlOf(keyRel) {
  if (!redisAvailable()) return -2;
  try {
    return Number(await store().ttl(keyRel));
  } catch (err) {
    log.warn('ttlOf Redis 失败', err);
    return -2;
  }
}

/**
 * 判断 Hash 索引中是否已有某 field
 *
 * @param {string} hashRel 相对 hash key
 * @param {string} field field 名
 * @returns {Promise<boolean>} 是否存在
 */
async function hasIndexField(hashRel, field) {
  if (!redisAvailable()) return false;
  try {
    return Boolean(await store().hexists(hashRel, field));
  } catch (err) {
    log.warn('hasIndexField Redis 失败', err);
    return false;
  }
}

/**
 * 写入永久封禁键（不带 TTL），供启动同步使用。已存在则不覆盖
 *
 * @param {string} keyRel 相对 key
 * @param {string} value JSON 值
 * @returns {Promise<boolean>} 是否已存在
 */
async function setIfAbsent(keyRel, value) {
  if (!redisAvailable()) return false;
  try {
    return Boolean(await store().call(client => client.set(full(keyRel), value, { NX: true })));
  } catch (err) {
    log.warn('setIfAbsent Redis 失败', err);
    return false;
  }
}

// ============== 挑战载荷（服务端持有、一次性消费） ==============

/**
 * 写入挑战载荷（服务端持有）
 *
 * 旧实现把「凭据」直接内嵌进挑战页 HTML（nonce/timestamp/HMAC 签名），客户端只要把
 * 页面里那串原样回传就算通过 —— 脚本取一次页面、回填一次即可绕过。现在改为服务端
 * 持有载荷、只下发一个不透明 challengeId：校验必须回查服务端状态，且一次性消费。
 *
 * @param {string} id 不透明挑战 ID
 * @param {object} payload 载荷 { ip, fingerprint, salt, difficulty }
 * @param {number} ttlSec 有效期（秒）
 * @returns {Promise<void>}
 */
async function writeChallenge(id, payload, ttlSec) {
  const keyRel = rel.challenge(id);
  if (!redisAvailable()) {
    mem.challenges.set(keyRel, { ...payload, expiresAt: Date.now() + ttlSec * 1000 });
    return;
  }
  try {
    await store().call(client => client.set(full(keyRel), JSON.stringify(payload), { EX: ttlSec }));
  } catch (err) {
    log.warn('writeChallenge Redis 失败', err);
  }
}

/**
 * 取走挑战载荷（原子 GET+DEL，保证「单次有效」）
 *
 * @param {string} id 挑战 ID
 * @returns {Promise<object|null>} 载荷对象；不存在 / 已消费 / 已过期返回 null
 */
async function takeChallenge(id) {
  const keyRel = rel.challenge(id);
  if (!redisAvailable()) {
    const entry = mem.challenges.get(keyRel);
    mem.challenges.delete(keyRel);
    if (!entry || (entry.expiresAt && Date.now() > entry.expiresAt)) return null;
    return entry;
  }
  try {
    // LUA_TAKE_CHALLENGE（GET+DEL）没有 ARGV，但仍显式给 `arguments: []`：
    // v5 的签名要求 keys/arguments 成套出现，且源码守卫
    // （firewall-redis-adapter.test.js）以此区分 v5 新签名与 ioredis 旧签名。
    const raw = await store().call(client => client.eval(LUA_TAKE_CHALLENGE, { keys: [full(keyRel)], arguments: [] }));
    if (raw === null || raw === undefined) return null;
    return JSON.parse(String(raw));
  } catch (err) {
    log.warn('takeChallenge Redis 失败', err);
    return null;
  }
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
  redisAvailable,
  store,
  full,
  rel,
  HASH,
  KEY_SENTINEL,
  PERMANENT_RETRY_AFTER,
  readAccessState,
  decodeStatus,
  normalizeDuration,
  writeBlock,
  removeBlock,
  writeWhitelist,
  removeWhitelist,
  listActive,
  bumpCounter,
  readCounter,
  removeCounters,
  consumeRateWindow,
  setFlag,
  hasFlag,
  grantPass,
  hasPass,
  writeChallenge,
  takeChallenge,
  removeKeys,
  scanKeys,
  getRaw,
  ttlOf,
  addBlockIndexEntry,
  hasIndexField,
  setIfAbsent,
  resetMemoryState
};
