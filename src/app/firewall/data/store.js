/**
 * 防火墙数据存储模块
 * 负责内存中访问记录的维护、持久化存储以及统计数据的汇总。
 *
 * 使用环形缓冲区存储最近的访问记录，固定内存占用，O(1) 写入。
 *
 * 跨实例汇聚（E3b）：单实例的统计只在内存里，多实例部署时每个实例只看到
 * 自己的流量。本模块在本地同步累加的同时维护一份「未刷写增量」，周期性
 * 批量写入 Redis（`util/redis.js` 的 `flushStatsDelta`，MULTI 一次往返）；
 * 读取侧 `getSummaryAggregated` / `getRecentRecordsAggregated` 用
 * 「Redis 全量 + 本实例未刷写增量」合并出全局视图。Redis 不可用时全部
 * 退回本实例视图，功能降级不报错。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-19 新增跨实例统计汇聚（增量刷写 + 聚合读取）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../../framework/log/index.js';
import { flushStatsDelta, readAggregatedStats, resetAggregatedStats, redisAvailable } from '../util/redis.js';

const log = createLogger('app.firewall.data.store');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 遥测持久化文件路径
 *
 * 可用 `FW_TRAFFIC_STATS_FILE` 覆盖 —— 测试**必须**覆盖它：默认路径是
 * `src/data/traffic_stats.json`，那是**被 git 跟踪**的文件，测试直写会留下脏改动。
 */
const DATA_FILE = process.env.FW_TRAFFIC_STATS_FILE || path.join(__dirname, '../../../data/traffic_stats.json');

const MAX_RECORDS = 1000; // 环形缓冲区容量（前端最多显示 100 条，1000 足够）

/** Redis 增量刷写周期（ms）。太短会把周期刷写变成压测，太长聚合视图滞后明显 */
const STATS_FLUSH_INTERVAL = 3000;

/**
 * 环形缓冲区
 * 固定大小数组 + 写入指针，O(1) 写入，无内存碎片
 */
class RingBuffer {
  constructor(capacity) {
    this.buffer = new Array(capacity);
    this.capacity = capacity;
    this.writeIndex = 0;
    this.count = 0;
  }

  push(item) {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** 获取最近 n 条记录（按时间顺序） */
  slice(n) {
    const size = Math.min(n, this.count);
    const result = new Array(size);
    const start = (this.writeIndex - size + this.capacity) % this.capacity;
    for (let i = 0; i < size; i++) {
      result[i] = this.buffer[(start + i) % this.capacity];
    }
    return result;
  }

  get length() {
    return this.count;
  }

  clear() {
    this.writeIndex = 0;
    this.count = 0;
  }
}

const records = new RingBuffer(MAX_RECORDS);
let totalRequests = 0;
let totalBlocked = 0;

const regionStats = new Map();
const pathStats = new Map();
const ipStats = new Map();

let broadcastHandler = null;

// ============== 跨实例统计汇聚（Redis 增量） ==============

/**
 * 本实例「尚未刷写到 Redis」的统计增量
 *
 * 只有 Redis 可用时才会累加（`pushRecord` 里以 `redisAvailable()` 门控），
 * 聚合读取 = Redis 全量 + 这份增量；刷写成功后即清空。刷写失败时原样
 * 放回，下个周期重试 —— 保证增量不丢、也不重复计。
 */
const pendingDelta = {
  requests: 0,
  blocked: 0,
  regions: new Map(),
  /** key = apiIdentifier（apiKey 或路径基名），value = { path, count, apiName } */
  paths: new Map(),
  ips: new Map(),
  /** 按时间正序追加 */
  records: []
};

let statsFlushTimer = null;
let statsFlushing = false;

function hasPendingStats() {
  return (
    pendingDelta.requests > 0 ||
    pendingDelta.blocked > 0 ||
    pendingDelta.regions.size > 0 ||
    pendingDelta.paths.size > 0 ||
    pendingDelta.ips.size > 0 ||
    pendingDelta.records.length > 0
  );
}

function clearPendingDelta() {
  pendingDelta.requests = 0;
  pendingDelta.blocked = 0;
  pendingDelta.regions.clear();
  pendingDelta.paths.clear();
  pendingDelta.ips.clear();
  pendingDelta.records.length = 0;
}

/** 取走当前增量（刷写前快照），失败时用 `restoreDelta` 放回 */
function takeDelta() {
  const delta = {
    requests: pendingDelta.requests,
    blocked: pendingDelta.blocked,
    regions: new Map(pendingDelta.regions),
    paths: new Map(pendingDelta.paths),
    ips: new Map(pendingDelta.ips),
    records: [...pendingDelta.records]
  };
  clearPendingDelta();
  return delta;
}

function restoreDelta(delta) {
  pendingDelta.requests += delta.requests;
  pendingDelta.blocked += delta.blocked;
  for (const [k, v] of delta.regions) pendingDelta.regions.set(k, (pendingDelta.regions.get(k) || 0) + v);
  for (const [k, stat] of delta.paths) {
    const cur = pendingDelta.paths.get(k) || { path: stat.path, count: 0, apiName: stat.apiName };
    cur.count += stat.count;
    if (!cur.apiName && stat.apiName) cur.apiName = stat.apiName;
    pendingDelta.paths.set(k, cur);
  }
  for (const [k, v] of delta.ips) pendingDelta.ips.set(k, (pendingDelta.ips.get(k) || 0) + v);
  pendingDelta.records.unshift(...delta.records);
}

/**
 * 把一条记录累加进未刷写增量（调用方已确认 Redis 可用）
 * @param {object} record 访问记录
 * @param {string} pathBase 去掉查询串的路径
 */
function trackDelta(record, pathBase) {
  pendingDelta.requests++;
  if (record.blocked) pendingDelta.blocked++;

  const regionKey = `${record.region || '未知'}-${record.city || '未知'}`;
  pendingDelta.regions.set(regionKey, (pendingDelta.regions.get(regionKey) || 0) + 1);

  // 与本地统计同键：优先 apiKey，其次已在 pathStats 里登记过 apiName 的路径键，
  // 否则用路径基名 —— 保证本地视图与聚合视图对同一路径落在同一个 hash field 上
  let apiIdentifier = record.apiKey || pathBase;
  if (!record.apiKey) {
    for (const [key, stat] of pathStats.entries()) {
      if (stat.path === pathBase && stat.apiName) {
        apiIdentifier = key;
        break;
      }
    }
  }
  const pStat = pendingDelta.paths.get(apiIdentifier) || {
    path: pathBase,
    count: 0,
    apiName: record.apiKey || null
  };
  pStat.count++;
  if (!pStat.apiName && record.apiKey) pStat.apiName = record.apiName || record.apiKey;
  pendingDelta.paths.set(apiIdentifier, pStat);

  if (record.ip) {
    pendingDelta.ips.set(record.ip, (pendingDelta.ips.get(record.ip) || 0) + 1);
  }

  pendingDelta.records.push(record);
}

/**
 * 把未刷写增量批量写入 Redis（失败原样放回，下个周期重试）
 * @returns {Promise<void>}
 */
async function flushPendingStats() {
  if (statsFlushing) return;
  statsFlushing = true;
  try {
    while (hasPendingStats()) {
      const delta = takeDelta();
      const ok = await flushStatsDelta(delta);
      if (!ok) {
        restoreDelta(delta);
        break;
      }
    }
  } finally {
    statsFlushing = false;
  }
}

function scheduleStatsFlush() {
  if (statsFlushTimer) return;
  statsFlushTimer = setTimeout(() => {
    statsFlushTimer = null;
    flushPendingStats().catch(err => {
      log.error('[Firewall Store] 统计增量刷写 Redis 失败:', err);
    });
  }, STATS_FLUSH_INTERVAL);
}

/** 停止统计刷写计时器（关闭流程用；未刷写增量由 flushPendingStats 兜底） */
function stopStatsFlushTimer() {
  if (statsFlushTimer) {
    clearTimeout(statsFlushTimer);
    statsFlushTimer = null;
  }
}

// ============== 持久化 ==============

function loadData() {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);

      // 恢复历史记录到环形缓冲区
      for (const r of data.records || []) {
        records.push(r);
      }
      totalRequests = data.totalRequests || 0;
      totalBlocked = data.totalBlocked || 0;

      (data.regionStats || []).forEach(([k, v]) => regionStats.set(k, v));
      (data.pathStats || []).forEach(([k, v]) => pathStats.set(k, v));
      (data.ipStats || []).forEach(([k, v]) => ipStats.set(k, v));

      log.info(`[Firewall Store] 已从磁盘恢复 ${records.length} 条记录`);
    }
  } catch (err) {
    log.error('[Firewall Store] 加载持久化数据失败:', err);
  }
}

let saveTimer = null;
let isSaving = false;

/**
 * 立即执行一次持久化（不做防抖）
 *
 * 从 `persistData` 里抽出来有两个原因：
 *   ① 防抖只是**调度策略**，写入语义（tmp+rename 的原子性）应当能被单独验证；
 *   ② 测试需要在不等待 10s 防抖的前提下驱动真实的写入路径。
 *
 * 【为什么必须原子写】
 * 直接 writeFile 到 DATA_FILE 有两个真实故障：
 *   ① 同一文件系统的 `rename` 是原子的，而 `writeFile` 不是 —— 读者（本进程的
 *      loadData，或多实例下的其他进程）可能读到**写到一半的 JSON**，
 *      JSON.parse 抛错后 catch 分支会把这次统计**整块丢掉**；
 *   ② 多实例共用同一份 DATA_FILE 时互相覆写，写坏的中间态还会被另一个进程读走。
 *
 * 临时文件名带 pid：多进程同时写时各自的 tmp 不互相踩，否则 A 写完 tmp、B 又覆写
 * 同一个 tmp，A 再 rename 就会把 B 的半截内容提升成正式文件。
 * 对照实现：`app/firewall/dao/dao.js` 的 triggerSave 用同一套 tmp+rename 模式。
 *
 * @returns {Promise<void>}
 */
async function persistNow() {
  const data = {
    records: records.slice(500), // 持久化最近 500 条
    totalRequests,
    totalBlocked,
    regionStats: [...regionStats.entries()],
    pathStats: [...pathStats.entries()],
    ipStats: [...ipStats.entries()]
  };

  const tmpFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpFile, JSON.stringify(data), 'utf-8');
  await fs.promises.rename(tmpFile, DATA_FILE);
}

function persistData() {
  if (saveTimer || isSaving) return;

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    isSaving = true;
    try {
      await persistNow();
    } catch (err) {
      log.error('[Firewall Store] 持久化数据失败:', err);
    } finally {
      isSaving = false;
    }
  }, 10000);
}

/**
 * 停止防抖计时器（应用关闭时调用）
 * 与 `dao.js` 的 `cleanupSaveTimer` 同职责：防止定时器在退出后触发写入。
 *
 * @returns {void}
 */
function stopPersistTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

/**
 * 优雅关闭时落盘（先停计时器再写一次）
 *
 * 为什么要做：遥测数据只存在于内存，滚动发布 / 重启时不落盘就会丢掉最近的统计。
 * 「有待写变更才写」这个前置判断很重要 —— 否则每次空跑启动都会把磁盘上的统计算成
 * 全零（`src/data/traffic_stats.json` 是被 git 跟踪的文件，无意义写入会留下脏改动）。
 * 写盘失败只记日志：关闭流程不能被遥测写盘拖住。
 *
 * 同时把未刷写的 Redis 增量冲一次：滚动发布时新实例能立刻看到旧实例的尾部统计。
 *
 * @returns {Promise<void>}
 */
async function flushPersist() {
  const hasPendingChanges = saveTimer !== null;
  stopPersistTimer();
  stopStatsFlushTimer();

  try {
    await flushPendingStats();
  } catch (err) {
    log.error('[Firewall Store] 关闭前刷写 Redis 增量失败:', err);
  }

  if (!hasPendingChanges) return;

  try {
    await persistNow();
  } catch (err) {
    log.error('[Firewall Store] 关闭前落盘失败:', err);
  }
}

// 初始化加载
loadData();

// ============== 公开接口 ==============

/**
 * 设置 WebSocket 广播处理器
 * @param {Function} handler
 */
function setBroadcastHandler(handler) {
  broadcastHandler = handler;
}

/**
 * 记录新的访问请求
 * @param {object} record
 */
function pushRecord(record) {
  records.push(record);
  totalRequests++;

  // WebSocket 广播
  if (broadcastHandler) {
    setImmediate(() => {
      try {
        broadcastHandler(record);
      } catch {
        /* ignore */
      }
    });
  }

  // 地域统计
  const regionKey = `${record.region || '未知'}-${record.city || '未知'}`;
  regionStats.set(regionKey, (regionStats.get(regionKey) || 0) + 1);

  // 路径统计
  const pathBase = record.url?.split('?')[0] || '/';
  let apiIdentifier = record.apiKey || pathBase;

  if (!record.apiKey) {
    for (const [key, stat] of pathStats.entries()) {
      if (stat.path === pathBase && stat.apiName) {
        apiIdentifier = key;
        break;
      }
    }
  } else if (pathStats.has(pathBase) && pathBase !== record.apiKey) {
    const oldStat = pathStats.get(pathBase);
    const currentStat = pathStats.get(record.apiKey) || {
      path: pathBase,
      count: 0,
      apiName: record.apiKey
    };
    currentStat.count += oldStat.count;
    pathStats.set(record.apiKey, currentStat);
    pathStats.delete(pathBase);
    apiIdentifier = record.apiKey;
  }

  if (!pathStats.has(apiIdentifier)) {
    pathStats.set(apiIdentifier, {
      path: pathBase,
      count: 0,
      apiName: record.apiKey || null
    });
  }
  const pStat = pathStats.get(apiIdentifier);
  pStat.count++;
  if (!pStat.apiName && record.apiKey) pStat.apiName = record.apiKey;
  pathStats.set(apiIdentifier, pStat);

  // IP 统计
  if (record.ip) {
    ipStats.set(record.ip, (ipStats.get(record.ip) || 0) + 1);
  }

  if (record.blocked) totalBlocked++;

  // 跨实例汇聚：只在 Redis 可用时维护增量（聚合是 Redis 增强能力）
  if (redisAvailable()) {
    trackDelta(record, pathBase);
    scheduleStatsFlush();
  }

  persistData();
}

/**
 * 获取最近 N 条记录（本实例视图）
 * @param {number} limit
 * @returns {Array}
 */
function getRecentRecords(limit = 100) {
  return records.slice(limit);
}

/**
 * 获取统计摘要（本实例视图）
 * @returns {Object}
 */
function getSummary() {
  const topRegions = [...regionStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([region, count]) => ({ region, count }));

  const topPaths = [...pathStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([key, stat]) => ({
      path: stat.path,
      count: stat.count,
      apiName: stat.apiName
    }));

  const topIps = [...ipStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ip, count]) => ({ ip, count }));

  return {
    totalRequests,
    totalBlocked,
    bufferedCount: records.length,
    bufferCapacity: MAX_RECORDS,
    topRegions,
    topPaths,
    topIps
  };
}

/**
 * 合并 Redis 全量与本实例未刷写增量
 *
 * 键对齐：Redis 侧 paths 的 key 是 hash 的原始 field（apiIdentifier），
 * 增量侧用同一套键规则累加（见 `trackDelta`），同一路径不会算成两条。
 *
 * @param {object} remote `readAggregatedStats` 的返回
 * @param {object} pending 未刷写增量（即 `pendingDelta` 的形状）
 * @returns {{totals: object, regions: Map, ips: Map, paths: Map}}
 */
function mergeAggregated(remote, pending) {
  const totals = {
    requests: (remote.totals?.requests || 0) + (pending.requests || 0),
    blocked: (remote.totals?.blocked || 0) + (pending.blocked || 0)
  };

  const regions = new Map((remote.regions || []).map(r => [r.region, r.count]));
  for (const [k, v] of pending.regions) regions.set(k, (regions.get(k) || 0) + v);

  const ips = new Map((remote.ips || []).map(r => [r.ip, r.count]));
  for (const [k, v] of pending.ips) ips.set(k, (ips.get(k) || 0) + v);

  const paths = new Map(
    (remote.paths || []).map(p => [p.key, { path: p.path, count: p.count, apiName: p.apiName }])
  );
  for (const [k, stat] of pending.paths) {
    const cur = paths.get(k) || { path: stat.path, count: 0, apiName: stat.apiName };
    cur.count += stat.count;
    if (!cur.apiName && stat.apiName) cur.apiName = stat.apiName;
    paths.set(k, cur);
  }

  return { totals, regions, ips, paths };
}

/**
 * 获取跨实例聚合的统计摘要
 *
 * Redis 不可用或读取失败时退回本实例视图（降级不报错）。
 *
 * @returns {Promise<Object>}
 */
async function getSummaryAggregated() {
  const local = getSummary();
  if (!redisAvailable()) return local;

  const remote = await readAggregatedStats({ recordLimit: 0 });
  if (!remote) return local;

  const merged = mergeAggregated(remote, pendingDelta);

  const topRegions = [...merged.regions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([region, count]) => ({ region, count }));

  const topPaths = [...merged.paths.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([, stat]) => ({ path: stat.path, count: stat.count, apiName: stat.apiName }));

  const topIps = [...merged.ips.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ip, count]) => ({ ip, count }));

  return {
    totalRequests: merged.totals.requests,
    totalBlocked: merged.totals.blocked,
    bufferedCount: records.length,
    bufferCapacity: MAX_RECORDS,
    topRegions,
    topPaths,
    topIps
  };
}

/**
 * 获取跨实例聚合的最近记录
 *
 * 未刷写增量（pendingDelta.records，时间正序）比 Redis 里已刷写的都新，
 * 反转后拼在前面即全局「最新优先」。Redis 不可用时退回本实例视图。
 *
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getRecentRecordsAggregated(limit = 100) {
  if (!redisAvailable()) return getRecentRecords(limit);

  const remote = await readAggregatedStats({ recordLimit: limit });
  if (!remote) return getRecentRecords(limit);

  const pendingNewestFirst = [...pendingDelta.records].reverse();
  return [...pendingNewestFirst, ...remote.records].slice(0, limit);
}

/**
 * 清空所有数据（本地 + Redis 汇聚）
 */
async function clearAll() {
  records.clear();
  regionStats.clear();
  pathStats.clear();
  ipStats.clear();
  totalRequests = 0;
  totalBlocked = 0;
  clearPendingDelta();

  // 清 Redis 聚合键：失败只记日志（可能是单实例降级场景，本地已清干净）
  try {
    await resetAggregatedStats();
  } catch (err) {
    log.error('[Firewall Store] 清空 Redis 聚合统计失败:', err);
  }

  const data = {
    records: [],
    totalRequests: 0,
    totalBlocked: 0,
    regionStats: [],
    pathStats: [],
    ipStats: []
  };
  fs.promises.writeFile(DATA_FILE, JSON.stringify(data), 'utf-8').catch(err => {
    log.error('[Firewall Store] 清空持久化数据失败:', err);
  });
}

export {
  setBroadcastHandler,
  pushRecord,
  getRecentRecords,
  getSummary,
  getSummaryAggregated,
  getRecentRecordsAggregated,
  clearAll,
  stopPersistTimer,
  flushPersist,
  // 仅供测试直接驱动持久化写入语义（生产路径是 persistData 的 10s 防抖）。
  // 前缀 `__test__` 明示"非公开 API"，生产代码不应调用。
  persistNow as __test__persistNow,
  // 同上，但驱动的是**跨实例汇聚**那条链路（写 Redis），与上一个不是一回事：
  // `persistNow` 写的是本地 JSON 文件，对"别的进程能不能看到"毫无贡献。
  // 生产路径是 pushRecord → scheduleStatsFlush 的 3s 周期；验证关卡需要在
  // 子进程退出前把增量真正刷进 Redis，否则跨实例可见性根本无从验证。
  flushPendingStats as __test__flushStats,
  stopStatsFlushTimer as __test__stopStatsFlushTimer
};
