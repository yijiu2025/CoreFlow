/**
 * 防火墙数据存储模块
 * 负责内存中访问记录的维护、持久化存储以及统计数据的汇总。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../../data/traffic_stats.json');

const MAX_RECORDS = 10000;

/**
 * 访问记录环形缓冲区
 */
const records = [];
let totalRequests = 0;       // 历史总请求数
let totalBlocked = 0;        // 历史总拦截数

const regionStats = new Map(); // 地域分布统计
const pathStats = new Map();   // 访问路径/API 统计
const ipStats = new Map();     // IP 访问频率统计

let broadcastHandler = null;

// 持久化：从文件加载数据
/**
 * 从磁盘加载持久化数据
 */
function loadData() {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      
      records.push(...(data.records || []));
      totalRequests = data.totalRequests || 0;
      totalBlocked = data.totalBlocked || 0;
      
      (data.regionStats || []).forEach(([k, v]) => regionStats.set(k, v));
      (data.pathStats || []).forEach(([k, v]) => pathStats.set(k, v));
      (data.ipStats || []).forEach(([k, v]) => ipStats.set(k, v));
      
      console.log(`💾 [Firewall Store] 已从磁盘恢复 ${records.length} 条记录`);
    }
  } catch (err) {
    console.error('🚨 [Firewall Store] 加载持久化数据失败:', err.message);
  }
}

// 持久化：保存到文件
let saveTimer = null;
let isSaving = false; // 防止重叠写入

/**
 * 将内存数据异步保存到磁盘（节流执行）
 */
async function persistData() {
  if (saveTimer || isSaving) return;
  
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    isSaving = true;
    try {
      const data = {
        records: records.slice(-1000), // 磁盘只存最近 1000 条
        totalRequests,
        totalBlocked,
        regionStats: [...regionStats.entries()],
        pathStats: [...pathStats.entries()],
        ipStats: [...ipStats.entries()]
      };
      
      // 使用异步写入，避免阻塞事件循环
      await fs.promises.writeFile(DATA_FILE, JSON.stringify(data), 'utf-8');
    } catch (err) {
      console.error('🚨 [Firewall Store] 异步保存持久化数据失败:', err.message);
    } finally {
      isSaving = false;
    }
  }, 10000); // 10秒节流，降低 I/O 频率
}

// 初始化加载
loadData();

/**
 * 设置记录广播处理器（通常用于 WebSocket 推送）
 * @param {Function} handler 广播处理函数
 */
export function setBroadcastHandler(handler) {
  broadcastHandler = handler;
}

/**
 * 推入一条访问记录
 */
/**
 * 记录新的访问请求
 * @param {Object} record 访问记录对象
 */
export function pushRecord(record) {
  records.push(record);
  totalRequests++;
  
  // 优化：不再每次 shift，而是满额后一次性清理一批，大幅降低 O(N) 操作频率
  if (records.length > MAX_RECORDS + 500) {
    records.splice(0, 500);
  }

  if (broadcastHandler) {
    // 异步广播，防止阻塞主逻辑
    setImmediate(() => {
      try {
        broadcastHandler(record);
      } catch (err) {}
    });
  }

  // 统计逻辑
  const regionKey = `${record.region || '未知'}-${record.city || '未知'}`;
  regionStats.set(regionKey, (regionStats.get(regionKey) || 0) + 1);

  const pathBase = record.url?.split('?')[0] || '/';
  let apiIdentifier = record.apiKey || pathBase;
  
  // 核心：防止重复逻辑。如果当前请求没 apiKey (如被拦截)，
  // 但我们已经记录过该路径对应的 apiKey，则进行归并。
  if (!record.apiKey) {
    // 遍历现有统计，寻找路径一致且有 apiName 的条目
    for (const [key, stat] of pathStats.entries()) {
      if (stat.path === pathBase && stat.apiName) {
        apiIdentifier = key;
        break;
      }
    }
  } else {
    // 反之，如果当前请求有 apiKey，但之前可能存过一个只有路径的条目
    // 我们需要把那个旧条目“升级”或合并到当前 apiKey 下
    if (pathStats.has(pathBase) && pathBase !== record.apiKey) {
      const oldStat = pathStats.get(pathBase);
      const currentStat = pathStats.get(record.apiKey) || { path: pathBase, count: 0, apiName: record.apiKey };
      currentStat.count += oldStat.count;
      pathStats.set(record.apiKey, currentStat);
      pathStats.delete(pathBase);
      apiIdentifier = record.apiKey;
    }
  }

  if (!pathStats.has(apiIdentifier)) {
    pathStats.set(apiIdentifier, { path: pathBase, count: 0, apiName: record.apiKey || null });
  }
  const pStat = pathStats.get(apiIdentifier);
  pStat.count++;
  // 如果之前是 null 现在有了名，更新它
  if (!pStat.apiName && record.apiKey) pStat.apiName = record.apiKey;
  pathStats.set(apiIdentifier, pStat);

  if (record.ip) {
    ipStats.set(record.ip, (ipStats.get(record.ip) || 0) + 1);
  }

  if (record.blocked) totalBlocked++;
  
  // 触发持久化
  persistData();
}

/**
 * 获取最近 N 条记录
 */
/**
 * 获取最近的访问记录
 * @param {number} limit 数量限制
 * @returns {Array} 记录数组
 */
export function getRecentRecords(limit = 100) {
  return records.slice(-Math.min(limit, MAX_RECORDS));
}

/**
 * 获取全局统计摘要
 */
/**
 * 获取防火墙运行情况的统计摘要
 * @returns {Object} 包含各项统计指标的对象
 */
export function getSummary() {
  const topRegions = [...regionStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([region, count]) => ({ region, count }));

  const topPaths = [...pathStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([key, stat]) => ({ path: stat.path, count: stat.count, apiName: stat.apiName }));

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
 * 清空所有统计数据
 */
export function clearAll() {
  records.length = 0;
  regionStats.clear();
  pathStats.clear();
  ipStats.clear();
  totalRequests = 0;
  totalBlocked = 0;
  
  // 异步同步到磁盘，避免阻塞
  const data = {
    records: [],
    totalRequests: 0,
    totalBlocked: 0,
    regionStats: [],
    pathStats: [],
    ipStats: []
  };
  fs.promises.writeFile(DATA_FILE, JSON.stringify(data), 'utf-8').catch(err => {
    console.error('🚨 [Firewall Store] 清空持久化数据失败:', err.message);
  });
}
