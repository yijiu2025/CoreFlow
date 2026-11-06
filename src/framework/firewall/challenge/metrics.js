/**
 * 挑战链路观测（进程内累加 + 增量汇出）
 *
 * 为什么单独一个模块：挑战的成功率/耗时是**唯一能证明整条链路还活着**的指标 ——
 * 2026-11-05 那次「生产 CSP 把挑战页整段拦掉」就是典型的"HTTP 200 但用户永远过不去"，
 * 因为没有成功率，没人发现。而这类指标既不属于请求记录（`store.js` 的 1000 条环形缓冲
 * 会被流量冲掉），也不该在热路径上写 Redis。
 *
 * 设计三条约束：
 *   ① **热路径零分配**：只做一次 `Map.set` 自增，不拼对象、不写日志、不碰 Redis；
 *   ② **字段数有界**：键由维度拼成（provider / reason / 桶 / 难度 / 页面形态），
 *      全是枚举，不存在"被攻击撑爆内存"的路径；
 *   ③ **汇出由 app 层驱动**：本模块属于 framework，不能反向 import 面板的 stats-redis；
 *      `app/firewall/data/store.js` 在自己的刷写周期里 `drainChallengeMetrics()` 取走增量，
 *      与流量增量一起批量 HINCRBY 进 Redis（失败时 `mergeChallengeMetrics()` 放回）。
 *
 * 只收**服务端真能观测到**的五种事件。客户端"解不出来"（用完 maxAttempts）没有上报入口，
 * 靠「issued 与 verified 的差额」反映 —— 造一个只涨不跌的 `unsolvable` 计数没有意义。
 *
 * 字段命名（Redis hash field，`stats:challenge`）：
 *   issued:<provider>         签发成功
 *   issueRejected:<reason>    签发被拒（如 Not Challenged —— 不在挑战态却去要票）
 *   verified:<provider>       验证通过
 *   failed:<reason>           验证失败（Expired / Mismatch / Invalid Proof / Malformed）
 *   solveMs:b<0..5>           求解耗时桶（客户端上报，只统计，不参与判定）
 *   difficulty:<1..5>         下发的难度
 *   surface:<inline|page|xhr> 挑战页从哪条链路来的（内置页 / 302 前端页 / 428 提示）
 *
 * @author yijiu2025
 * @since 2026-11-06
 */

/**
 * 求解耗时桶的上界（毫秒）；最后一个桶是开区间
 *
 * 为什么用"桶"而不是原始数组：面板要的是 P50/P95 估算，存原始样本既占内存又要排序，
 * 而告警只需要数量级（<10ms 正常、>1s 说明难度配高了或设备太差）。
 *
 * @type {number[]}
 */
const SOLVE_MS_BOUNDS = [10, 50, 200, 1000, 5000];

/** 当前进程内的累加表：field → count */
let counters = new Map();

/**
 * 单字段自增（热路径唯一的写入口）
 *
 * @param {string} field 字段名
 * @returns {void}
 */
function bump(field) {
  counters.set(field, (counters.get(field) || 0) + 1);
}

/**
 * 求解耗时落在哪个桶
 *
 * @param {number} solveMs 耗时（毫秒）
 * @returns {number} 桶下标 0..SOLVE_MS_BOUNDS.length；无效值返回 -1（客户端可伪造，只做统计）
 */
function solveMsBucketIndex(solveMs) {
  // null / '' 会经 Number() 变成 0，被误当成"0ms 秒解"，必须单独挡掉
  if (solveMs === null || solveMs === undefined || solveMs === '') return -1;
  const ms = Number(solveMs);
  if (!Number.isFinite(ms) || ms < 0) return -1;
  let i = 0;
  while (i < SOLVE_MS_BOUNDS.length && ms > SOLVE_MS_BOUNDS[i]) i++;
  return i;
}

/**
 * 记录一次挑战事件
 *
 * @param {object} event 事件
 * @param {'issued'|'issueRejected'|'verified'|'failed'|'surface'} event.type 类型
 * @param {string} [event.provider='pow'] 验证方式（pow / turnstile / …）
 * @param {string} [event.reason] 失败/拒绝原因（服务端生成，非客户端可控）
 * @param {number} [event.difficulty] 难度（仅 issued）
 * @param {string} [event.surface] 页面形态：inline / page / xhr（仅 surface 事件）
 * @param {number} [event.solveMs] 客户端上报的求解耗时（仅 verified）
 * @returns {void}
 */
function recordChallengeEvent(event) {
  if (!event || typeof event.type !== 'string') return;
  const provider = typeof event.provider === 'string' && event.provider ? event.provider : 'pow';

  switch (event.type) {
    case 'issued':
      bump(`issued:${provider}`);
      // 难度只可能是 1~5（`MAX_DIFFICULTY`），越界值不入账 ——
      // 否则一个写错的上游就能往 hash 里塞任意 field（内存/Redis 都会涨）
      if (
        Number.isInteger(Number(event.difficulty)) &&
        Number(event.difficulty) >= 1 &&
        Number(event.difficulty) <= 5
      ) {
        bump(`difficulty:${Number(event.difficulty)}`);
      }
      break;
    case 'issueRejected':
      bump(`issueRejected:${event.reason || 'unknown'}`);
      break;
    case 'verified': {
      bump(`verified:${provider}`);
      // 耗时只在真正通过时才有意义（失败可能根本是网络错误）
      const idx = solveMsBucketIndex(event.solveMs);
      if (idx >= 0) bump(`solveMs:b${idx}`);
      break;
    }
    case 'failed':
      bump(`failed:${event.reason || 'unknown'}`);
      break;
    case 'surface':
      if (typeof event.surface === 'string' && event.surface) bump(`surface:${event.surface}`);
      break;
    default:
      // 未知事件不记账：写错了应该在测试里暴露，而不是污染统计
      break;
  }
}

/**
 * 取走当前增量（刷写前快照）并清零
 *
 * @returns {Object<string, number>} field → 增量
 */
function drainChallengeMetrics() {
  const out = {};
  for (const [field, n] of counters) if (n > 0) out[field] = n;
  counters = new Map();
  return out;
}

/**
 * 把一批增量放回（Redis 刷写失败时重试用）
 *
 * @param {Object<string, number>} fields field → 增量
 * @returns {void}
 */
function mergeChallengeMetrics(fields) {
  if (!fields || typeof fields !== 'object') return;
  for (const [field, n] of Object.entries(fields)) {
    const add = Number(n);
    if (Number.isFinite(add) && add > 0) counters.set(field, (counters.get(field) || 0) + add);
  }
}

/**
 * 只看当前未刷写的增量（测试 / 排障用）
 *
 * @returns {Object<string, number>} field → 增量
 */
function peekChallengeMetrics() {
  const out = {};
  for (const [field, n] of counters) if (n > 0) out[field] = n;
  return out;
}

/**
 * 清空（单测用，避免用例之间互相污染）
 *
 * @returns {void}
 */
function resetChallengeMetrics() {
  counters = new Map();
}

/**
 * 用桶估算 P50 / P95
 *
 * 估算口径（诚实标注，别当精确值用）：落在第 i 桶的样本按桶内均匀分布取桶中点，
 * 开区间末桶取 `lastBound * 2`。样本为 0 时返回 null。
 *
 * @param {number[]} buckets 各桶计数
 * @returns {{p50EstimateMs: number|null, p95EstimateMs: number|null, samples: number}} 估算结果
 */
function estimatePercentiles(buckets) {
  const samples = buckets.reduce((a, b) => a + b, 0);
  if (samples === 0) return { p50EstimateMs: null, p95EstimateMs: null, samples: 0 };

  const midpoint = i => {
    const last = SOLVE_MS_BOUNDS[SOLVE_MS_BOUNDS.length - 1];
    const hi = i < SOLVE_MS_BOUNDS.length ? SOLVE_MS_BOUNDS[i] : last * 2;
    const lo = i === 0 ? 0 : SOLVE_MS_BOUNDS[i - 1];
    return Math.round((lo + hi) / 2);
  };

  const pick = ratio => {
    const target = samples * ratio;
    let acc = 0;
    for (let i = 0; i < buckets.length; i++) {
      acc += buckets[i];
      if (acc >= target) return midpoint(i);
    }
    return midpoint(buckets.length - 1);
  };

  return { p50EstimateMs: pick(0.5), p95EstimateMs: pick(0.95), samples };
}

/**
 * 把 field → count 还原成人能看懂的汇总
 *
 * @param {Object<string, number>} fields 字段表（Redis 聚合或进程内增量）
 * @returns {object} 汇总（issued / verified / failed / successRate / solveMs / 各维度分布）
 */
function summarizeChallengeFields(fields) {
  const buckets = new Array(SOLVE_MS_BOUNDS.length + 1).fill(0);
  const reasons = {};
  const issueRejected = {};
  const byProvider = {};
  const byDifficulty = {};
  const bySurface = {};
  let issued = 0;
  let verified = 0;
  let failed = 0;

  for (const [field, raw] of Object.entries(fields || {})) {
    const n = Number(raw) || 0;
    if (n <= 0) continue;
    const sep = field.indexOf(':');
    const kind = sep > 0 ? field.slice(0, sep) : field;
    const value = sep > 0 ? field.slice(sep + 1) : '';

    switch (kind) {
      case 'issued':
        issued += n;
        byProvider[value] = (byProvider[value] || 0) + n;
        break;
      case 'verified':
        verified += n;
        break;
      case 'failed':
        failed += n;
        reasons[value] = (reasons[value] || 0) + n;
        break;
      case 'issueRejected':
        issueRejected[value] = (issueRejected[value] || 0) + n;
        break;
      case 'difficulty':
        byDifficulty[value] = (byDifficulty[value] || 0) + n;
        break;
      case 'surface':
        bySurface[value] = (bySurface[value] || 0) + n;
        break;
      case 'solveMs': {
        const idx = Number(value.replace(/^b/, ''));
        if (Number.isInteger(idx) && idx >= 0 && idx < buckets.length) buckets[idx] += n;
        break;
      }
      default:
        break;
    }
  }

  const attempts = verified + failed;
  return {
    issued,
    verified,
    failed,
    issueRejected,
    /** 通过率：分母只算"真正提交过答案"的次数（签发数会被"打开页面又关掉"放大） */
    successRate: attempts > 0 ? Number((verified / attempts).toFixed(4)) : null,
    reasons,
    byProvider,
    byDifficulty,
    bySurface,
    solveMs: {
      bounds: [...SOLVE_MS_BOUNDS],
      buckets,
      ...estimatePercentiles(buckets)
    }
  };
}

export {
  recordChallengeEvent,
  drainChallengeMetrics,
  mergeChallengeMetrics,
  peekChallengeMetrics,
  resetChallengeMetrics,
  summarizeChallengeFields,
  solveMsBucketIndex,
  SOLVE_MS_BOUNDS
};
