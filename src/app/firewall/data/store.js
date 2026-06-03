/**
 * 防火墙数据存储模块
 * 负责内存中访问记录的维护、持久化存储以及统计数据的汇总。
 *
 * 使用环形缓冲区存储最近的访问记录，固定内存占用，O(1) 写入。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../../../data/traffic_stats.json');

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

      console.log(`[Firewall Store] 已从磁盘恢复 ${records.length} 条记录`);
    }
  } catch (err) {
    console.error('[Firewall Store] 加载持久化数据失败:', err.message);
  }
}

let saveTimer = null;
let isSaving = false;

function persistData() {
  if (saveTimer || isSaving) return;

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    isSaving = true;
    try {
      const data = {
        records: records.slice(500), // 持久化最近 500 条
        totalRequests,
        totalBlocked,
        regionStats: [...regionStats.entries()],
        pathStats: [...pathStats.entries()],
        ipStats: [...ipStats.entries()]
      };
      await fs.promises.writeFile(DATA_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('[Firewall Store] 持久化数据失败:', err.message);
    } finally {
      isSaving = false;
    }
  }, 10000);
}

// 初始化加载
loadData();

// ============== 公开接口 ==============

/**
 * 设置 WebSocket 广播处理器
 * @param {Function} handler
 */
export function setBroadcastHandler(handler) {
  broadcastHandler = handler;
}

/**
 * 记录新的访问请求
 * @param {Object} record
 */
export function pushRecord(record) {
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
export function getRecentRecords(limit = 100) {
  return records.slice(limit);
}

/**
 * 获取统计摘要
 * @returns {Object}
 */
export function getSummary() {
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
export function clearAll() {
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
  fs.promises
    .writeFile(DATA_FILE, JSON.stringify(data), 'utf-8')
    .catch((err) => {
      console.error('[Firewall Store] 清空持久化数据失败:', err.message);
    });
}
