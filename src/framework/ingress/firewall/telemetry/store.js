/**
 * 防火墙遥测存储（framework 层：进程内累加 + 单文件落盘）
 *
 * ── 为什么住在 framework ──
 * 防护核心（`engine/pipeline.js`）在热路径上通过 `telemetry-sink.js` 抛出记录事件，
 * 但 sink 只持有函数引用，本身不存数据。历史实现里接收器由 `app/firewall/data/store.js`
 * 注册 —— 那是「面板应用」的一部分。应用被卸载后，sink 恒为空，管理后台的
 * 「防火墙监控」页只能看到 0 / 0 / 0，而且**没有任何报错**（fail-open 的副作用被当成了正常）。
 *
 * 遥测是防护核心自身的可观测能力，不是某个具体 app 的业务：
 * 记录在哪产生（framework）、怎么累加（framework）应当同层，只有**展示**属于 app。
 * 因此这里提供框架自带的接收器：核心一启动就接上，app 可有可无。
 *
 * ── 存储策略（刻意的取舍） ──
 *   ① 热路径只做两次自增 + 一次环形入队，不碰磁盘、不拼 JSON；
 *   ② 单进程内存态，定时（默认 10s）**整文件覆盖**落盘，进程退出前再刷一次；
 *   ③ 读失败/写失败一律只告警 —— 遥测坏了不能让防护停摆，也不能让启动失败；
 *   ④ 只保留最近 N 条明细（默认 500），累计计数单独持久化，避免文件随流量无限增长。
 *
 * 多实例语义：每个实例各写各的文件（同机部署会互相覆盖）。这是**已知边界**，
 * 与 `data/` 目录本身的单机定位一致；跨实例聚合需要 Redis，属于面板范畴，不在本模块假装支持。
 *
 * @author yijiu2025
 * @since 2026-11-21 自 app/firewall/data/store.js 上收最小可用子集（计数器 + 环形明细 + 落盘）
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataFile } from '../../../config/paths.js';
import { registerRecordSink } from '../telemetry-sink.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.firewall.telemetry');

/** 明细环形缓冲上限（累计计数不受此限制） */
const MAX_RECORDS = 500;

/** 落盘周期（毫秒）；`unref` 后不阻塞进程退出 */
const FLUSH_INTERVAL_MS = 10_000;

/**
 * 统计文件（仓库根 data/，缺失时自动创建）
 *
 * `FW_TRAFFIC_STATS_FILE` 是**测试专用**覆盖（与历史约定同名）：测试必须写临时文件，
 * 否则跑一次单测就会把真实的累计计数覆盖成夹具数据。
 */
const STATS_FILE = process.env.FW_TRAFFIC_STATS_FILE
  ? path.resolve(process.env.FW_TRAFFIC_STATS_FILE)
  : dataFile('traffic_stats.json');

/** 进程内状态 */
const state = {
  totalRequests: 0,
  totalBlocked: 0,
  /** @type {object[]} */
  records: [],
  /** @type {NodeJS.Timeout|null} */
  timer: null,
  /** 是否已从磁盘恢复过（避免重复覆盖内存中的实时值） */
  hydrated: false,
  /** 落盘失败只告警一次，避免每周期刷屏 */
  flushWarned: false
};

/**
 * 从磁盘恢复累计计数与最近明细
 *
 * 文件缺失 / 格式错误都按「从零开始」处理：首次部署本来就没有这个文件。
 *
 * @returns {void}
 */
function hydrate() {
  if (state.hydrated) return;
  state.hydrated = true;
  try {
    if (!fs.existsSync(STATS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    const totalRequests = Number(raw?.totalRequests);
    const totalBlocked = Number(raw?.totalBlocked);
    if (Number.isFinite(totalRequests) && totalRequests >= 0) state.totalRequests = totalRequests;
    if (Number.isFinite(totalBlocked) && totalBlocked >= 0) state.totalBlocked = totalBlocked;
    if (Array.isArray(raw?.records)) {
      // 兼容旧文件（历史上限 1000）：只取尾部，且过滤掉非对象项
      state.records = raw.records.filter(r => r && typeof r === 'object').slice(-MAX_RECORDS);
    }
  } catch (err) {
    log.warn(`⚠️ [Firewall] 遥测文件读取失败，从零开始统计: ${err.message}`);
  }
}

/**
 * 接收一条遥测记录（sink 调用，热路径）
 *
 * 只做纯内存操作，任何异常都在 sink 层被吞掉；这里再包一层是为了让「单条坏记录」
 * 不影响后续计数（例如 record 是冻结对象 / 被篡改成奇怪形状）。
 *
 * @param {object} record 遥测记录（blocked / statusCode / ip / url …）
 * @returns {void}
 */
function pushRecord(record) {
  if (!record || typeof record !== 'object') return;
  state.totalRequests += 1;
  if (record.blocked) state.totalBlocked += 1;

  state.records.push(record);
  if (state.records.length > MAX_RECORDS) {
    // 一次裁掉超出部分（splice 比反复 shift 便宜，且只在超限时触发）
    state.records.splice(0, state.records.length - MAX_RECORDS);
  }
}

/**
 * 汇总读数（只读快照，供管理接口）
 *
 * @returns {{totalRequests:number,totalBlocked:number,bufferedCount:number,recordLimit:number}}
 */
function getSummary() {
  return {
    totalRequests: state.totalRequests,
    totalBlocked: state.totalBlocked,
    bufferedCount: state.records.length,
    recordLimit: MAX_RECORDS
  };
}

/**
 * 最近明细（按时间正序，尾部是最新）
 *
 * @param {number} [limit=MAX_RECORDS] 取多少条
 * @returns {object[]} 记录数组（浅拷贝，调用方可安全序列化）
 */
function getRecentRecords(limit = MAX_RECORDS) {
  const n = Number.isInteger(limit) && limit > 0 ? limit : MAX_RECORDS;
  return state.records.slice(-n);
}

/**
 * 把当前状态写入统计文件
 *
 * 采用「临时文件 + rename」：直接覆盖写时，进程被杀会留下半截 JSON，
 * 下次启动读不出来（表现为统计突然归零）。rename 在同一分区是原子的。
 *
 * @returns {boolean} 是否成功
 */
function flush() {
  try {
    // 目录按**实际目标文件**推导：测试覆盖路径可能在临时目录，此时不该去碰仓库的 data/
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    const payload = JSON.stringify({
      records: state.records,
      totalRequests: state.totalRequests,
      totalBlocked: state.totalBlocked,
      updatedAt: new Date().toISOString()
    });
    const tmp = `${STATS_FILE}.tmp`;
    fs.writeFileSync(tmp, payload, 'utf-8');
    fs.renameSync(tmp, STATS_FILE);
    state.flushWarned = false;
    return true;
  } catch (err) {
    if (!state.flushWarned) {
      state.flushWarned = true;
      log.warn(`⚠️ [Firewall] 遥测落盘失败（仅告警一次）: ${err.message}`);
    }
    return false;
  }
}

/**
 * 启动遥测接收（幂等）
 *
 * 顺序：先恢复磁盘计数，再注册 sink —— 反过来会让恢复阶段的赋值覆盖掉
 * 启动瞬间已经收进来的记录（服务注册插件期间就可能有请求）。
 *
 * @returns {void}
 */
function startTelemetry() {
  hydrate();
  registerRecordSink(pushRecord);
  if (state.timer) return;
  state.timer = setInterval(flush, FLUSH_INTERVAL_MS);
  // 不因这个定时器拖住进程退出（node 默认会等 setInterval）
  state.timer.unref?.();
}

/**
 * 停止遥测接收并落盘（幂等）
 *
 * @returns {void}
 */
function stopTelemetry() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  flush();
}

/**
 * 清空统计（测试 / 运维复位用）
 *
 * @returns {void}
 */
function resetTelemetry() {
  state.totalRequests = 0;
  state.totalBlocked = 0;
  state.records = [];
  // 允许下一次 startTelemetry 重新从磁盘恢复（测试用「复位 → 重启续算」验证持久化）
  state.hydrated = false;
}

export {
  startTelemetry,
  stopTelemetry,
  resetTelemetry,
  hydrate,
  getSummary,
  getRecentRecords,
  flush,
  MAX_RECORDS,
  FLUSH_INTERVAL_MS,
  STATS_FILE
};
