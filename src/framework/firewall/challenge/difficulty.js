/**
 * 递进难度（挑战难度按"信誉"浮动）
 *
 * 解决的问题：难度固定一个值，对两类人都不是最优 ——
 *   · 正常用户偶尔被挑战，难度 3（约 4096 次哈希 / 1.6ms）纯属白等；
 *   · 反复答错的来源，难度 3 也拦不住（它本来就不是"人机判定"）。
 *
 * 所以按"这台机器最近的挑战表现"在一个区间内浮动：
 *
 * ```
 *   连续顺利通过  → 往 challengeDifficultyMin 降（最多降 1 档）
 *   反复答错      → 往 challengeDifficultyMax 升（最多升 2 档）
 *   已登录        → 整体再降 1 档（有身份可追责，体验优先）
 * ```
 *
 * ## 三条刻意的取舍
 *
 * 1. **只把「答案不对」计入升难度**。`Challenge Expired`（载荷 300s 过期）、
 *    `Challenge Mismatch`（切网导致 IP 变）、`Malformed` 都不计 —— 它们是客户端/网络
 *    问题的信号，拿它们升难度会把真实用户越推越死。这是这类机制最常见的自伤方式：
 *    用户越倒霉 → 题目越难 → 更过不去 → 题更难。
 * 2. **只按 IP 记**。换设备/换指纹正是攻击方的常规动作，捆太细就记不住；
 *    而按 IP 记的副作用（同一出口 NAT 多人共享）被"窗口 10 分钟 + 最多 ±2 档"限制住了。
 * 3. **窗口从第一次计数起算，不滑动**（复用 `bumpCounter` 的 INCR+EXPIRE）。
 *    滑动窗口要么每请求续期（等于永不结束），要么另开一套结构 —— 都不值得。
 *
 * ## 默认关闭
 *
 * `defense.challengeReputationEnabled` 默认 `false`：它改变的是"给用户出多难的题"，
 * 属于体验与防护的取舍，不该由一次升级替运维决定。关着的时候本模块只是"读配置 + return"。
 *
 * ## 可调项与不可调项
 *
 * 三个触发阈值走配置，运维可以按自己的流量画像改（不同站点"偶发"与"反复"的分界线不同）：
 *
 * | 配置项 | 默认 | 作用 |
 * | --- | --- | --- |
 * | `challengeReputationHardenAfterFails` | 2 | 答错这么多次且零通过 → 升 1 档 |
 * | `challengeReputationHardenStrongAfterFails` | 5 | 答错这么多次 → 升 2 档 |
 * | `challengeReputationRelaxAfterPasses` | 3 | 顺利通过这么多次且零失败 → 降 1 档 |
 * | `challengeReputationWindowSec` | 600 | 计数窗口（秒） |
 *
 * 窗口的**下限 30s**与**缺省 600s** 刻意留在代码里（`MIN_WINDOW_SEC` / `DEFAULT_WINDOW_SEC`）：
 * 它们是"给配置值兜底"的东西，本身再可配就成了没有兜底 —— 而且这两个数在
 * `config/schema.js` 里已经有一份（`min: 30` 与默认值），多一份可配副本只会漂移。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { getConfig } from '../util/shared.js';
import { bumpCounter, readCounter, rel } from '../util/redis.js';
import { clampDifficulty, DEFAULT_DIFFICULTY, MAX_DIFFICULTY } from '../../verify/pow/index.js';

/*
 * 三档触发阈值的**缺省值**
 *
 * 真正生效的值来自 `defense.challengeReputation*`（见 defaults.js 的取值理由）；
 * 这里的常量只在"配置缺失或写坏"时兜底 —— 配置能写成 `"abc"` / `0` / `null`，
 * 而这些数写坏之后的方向不能靠猜：`0` 会让每一台机器一秒内就顶到上限。
 */
/** 答错这么多次且一次都没通过 → 升 1 档 */
const DEFAULT_HARDEN_AFTER_FAILS = 2;
/** 答错这么多次 → 升 2 档（上限仍由 challengeDifficultyMax 夹） */
const DEFAULT_HARDEN_STRONG_AFTER_FAILS = 5;
/** 顺利通过这么多次且零失败 → 降 1 档 */
const DEFAULT_RELAX_AFTER_PASSES = 3;
/** 窗口缺省值（秒），与 defaults.js 的 challengeReputationWindowSec 一致 */
const DEFAULT_WINDOW_SEC = 600;
/** 窗口下限（秒）：低于 30s 时一次页面加载就能把窗口走完，等于没有窗口 */
const MIN_WINDOW_SEC = 30;

/**
 * 读一个正整数配置项，非法值回退
 *
 * 配置能写坏（`"abc"` / `0` / `null` / 负数），而这里每个数字写坏的后果都很具体：
 * 窗口 0 → 计数立刻过期（等于永远在基准）；`min > max` → 夹取区间反了。
 *
 * @param {unknown} raw 原始值
 * @param {number} fallback 回退值
 * @param {number} [lower] 下限（含）
 * @returns {number} 合法值
 */
function readPositive(raw, fallback, lower = 1) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < lower) return fallback;
  return n;
}

/**
 * 读出难度区间（`[min, max]`，已处理"写反了"的情况）
 *
 * @param {object} defense `defense` 配置
 * @returns {{min: number, max: number}} 合法区间（`min <= max`）
 */
function readRange(defense) {
  let min = clampDifficulty(defense.challengeDifficultyMin, 2);
  let max = clampDifficulty(defense.challengeDifficultyMax, MAX_DIFFICULTY);
  // 写反了不报错也不抛：交换即可，行为仍然可预测（比"什么都不生效"好排查）
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

/**
 * 当前（基准）难度：`challengeDifficulty` 夹到能力的合法区间
 *
 * @param {object} defense `defense` 配置
 * @returns {number} 基准难度
 */
function baseDifficulty(defense) {
  return clampDifficulty(defense.challengeDifficulty, DEFAULT_DIFFICULTY);
}

/**
 * 读出三档触发阈值
 *
 * 除了"非法值回退"，这里还要处理一处**语义写反**：`strong < harden`。
 * 那种配置下 `fails >= strong` 的判断先命中，`harden` 那一档永远走不到 ——
 * 表现为"配了个没人读的键"。抬到 `harden` 同值即可：行为退化成
 * "答错 harden 次直接升 2 档"，是可预测的，也比静默失效好排查。
 *
 * @param {object} defense `defense` 配置
 * @returns {{hardenAt: number, strongAt: number, relaxAt: number}} 合法阈值（`strongAt >= hardenAt`）
 */
function readThresholds(defense) {
  const hardenAt = readPositive(defense.challengeReputationHardenAfterFails, DEFAULT_HARDEN_AFTER_FAILS);
  const strongRaw = readPositive(defense.challengeReputationHardenStrongAfterFails, DEFAULT_HARDEN_STRONG_AFTER_FAILS);
  const relaxAt = readPositive(defense.challengeReputationRelaxAfterPasses, DEFAULT_RELAX_AFTER_PASSES);
  return { hardenAt, strongAt: Math.max(strongRaw, hardenAt), relaxAt };
}

/**
 * 算出这一次该给多难
 *
 * @param {{ip?: string, loggedIn?: boolean}} [subject] 挑战对象
 *   `ip` 缺失时（理论上不会）直接返回基准，不做任何计数读取。
 * @returns {Promise<{difficulty: number, reason: 'baseline'|'hardened'|'relaxed'}>}
 *   `reason` 是**粗粒度**的：只说"比基准难/易"，不暴露分数、不暴露计数 ——
 *   前端想解释"为什么被挑战"时够用，也不会变成攻击者的调参反馈通道。
 */
async function resolveChallengeDifficulty({ ip, loggedIn = false } = {}) {
  const defense = getConfig().defense ?? {};
  const base = baseDifficulty(defense);
  const { min, max } = readRange(defense);
  const clampToRange = n => Math.min(max, Math.max(min, n));

  // 关着 / 没有 IP → 基准（不读计数：热路径上少两次 Redis 往返）
  if (defense.challengeReputationEnabled !== true || !ip) {
    return { difficulty: clampToRange(base), reason: 'baseline' };
  }

  const [fails, passes] = await Promise.all([readCounter(rel.chalFail(ip)), readCounter(rel.chalPass(ip))]);
  const { hardenAt, strongAt, relaxAt } = readThresholds(defense);

  let delta = 0;
  if (fails >= strongAt) delta = 2;
  else if (fails >= hardenAt && passes === 0) delta = 1;
  else if (fails === 0 && passes >= relaxAt) delta = -1;

  // 登录用户降一档：有身份可追责，把体验让给他们（与 pass TTL 分档同一套逻辑）
  if (loggedIn) delta -= 1;

  // reason 跟**意图**走（delta 的符号），不跟"最终难度比基准高低"走：
  // 当 base 本身被 Min/Max 夹过时（例如 base=3 而 Min=4），两者会不一致，
  // 那种情况下前端说"这次更难了"是错的 —— 它只是被区间抬到了下限。
  const difficulty = clampToRange(base + delta);
  const reason = delta > 0 ? 'hardened' : delta < 0 ? 'relaxed' : 'baseline';
  return { difficulty, reason };
}

/**
 * 读计数窗口（秒）
 *
 * @param {object} defense `defense` 配置
 * @returns {number} 窗口秒数
 */
function reputationWindowSec(defense) {
  return readPositive(defense.challengeReputationWindowSec, DEFAULT_WINDOW_SEC, MIN_WINDOW_SEC);
}

/**
 * 记一次「顺利通过」
 *
 * @param {string} ip 客户端 IP
 * @returns {Promise<void>} 不抛错（计数失败不该影响"验证已通过"这个事实）
 */
async function noteChallengePassed(ip) {
  try {
    const defense = getConfig().defense ?? {};
    if (defense.challengeReputationEnabled !== true || !ip) return;
    await bumpCounter(rel.chalPass(ip), reputationWindowSec(defense));
  } catch {
    // 统计性质的数据：失败就少记一次，绝不影响主流程
  }
}

/**
 * 记一次「答案不对」
 *
 * ⚠️ 只有 `Invalid Proof` 该调这里。`Expired` / `Mismatch` / `Malformed` 属于
 * 客户端或网络问题，计进来会把真实用户越推越死（见文件头注释）。
 *
 * @param {string} ip 客户端 IP
 * @returns {Promise<void>} 不抛错
 */
async function noteChallengeProofFailed(ip) {
  try {
    const defense = getConfig().defense ?? {};
    if (defense.challengeReputationEnabled !== true || !ip) return;
    await bumpCounter(rel.chalFail(ip), reputationWindowSec(defense));
  } catch {
    // 同上：只影响下一次难度，不影响本次判定
  }
}

export { resolveChallengeDifficulty, noteChallengePassed, noteChallengeProofFailed, reputationWindowSec };
