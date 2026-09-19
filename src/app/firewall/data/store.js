/**
 * 防火墙数据存储模块
 * 负责内存中访问记录的维护、持久化存储以及统计数据的汇总。
 *
 * 使用环形缓冲区存储最近的访问记录，固定内存占用，O(1) 写入。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../../framework/log/index.js';

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
 * @returns {Promise<void>}
 */
async function flushPersist() {
  const hasPendingChanges = saveTimer !== null;
  stopPersistTimer();
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
 * @param {Object} record
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

  persistData();
}

/**
 * 获取最近 N 条记录
 * @param {number} limit
 * @returns {Array}
 */
function getRecentRecords(limit = 100) {
  return records.slice(limit);
}

/**
 * 获取统计摘要
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
 * 清空所有数据
 */
function clearAll() {
  records.clear();
  regionStats.clear();
  pathStats.clear();
  ipStats.clear();
  totalRequests = 0;
  totalBlocked = 0;

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
  clearAll,
  stopPersistTimer,
  flushPersist,
  // 仅供测试直接驱动持久化写入语义（生产路径是 persistData 的 10s 防抖）。
  // 前缀 `__test__` 明示"非公开 API"，生产代码不应调用。
  persistNow as __test__persistNow
};
