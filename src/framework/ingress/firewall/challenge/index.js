/**
 * 人机挑战 · 框架层门面
 *
 * 挑战链路在框架层就这三件事，其余（provider 选路、发题/判题的 HTTP 编排）在 app 层：
 *
 * | 文件 | 职责 | 不该放进来什么 |
 * | --- | --- | --- |
 * | `difficulty.js` | 这一次该给多难（基准 ± 信誉浮动） | 不出题、不判题 |
 * | `metrics.js` | 签发/通过/失败的进程内计数与分位估算 | 不决定难度、不碰 Redis |
 * | `template.js` | 内置挑战页 HTML + 专属 CSP + 302 跳转 + PoW 载荷签发 | 不判题（判题在 `verify/pow`） |
 *
 * 三条边界是**故意**划的：难度决策会被 `template`（出题时算一次）和 app 的 provider
 * （答错时记一次）同时调用，判题能力却只有一个来源 `verify/pow` —— 把它塞进这里
 * 就会变成"挑战页自带一套判题、服务端另一套"，那是这类模块最经典的漂移方式。
 *
 * 调用方一律从本文件导入，不要直接指向 `./difficulty.js` 这类具体文件：
 * 门面只有一处，改文件划分时只动这里。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
export {
  resolveChallengeDifficulty,
  noteChallengePassed,
  noteChallengeProofFailed,
  reputationWindowSec
} from './difficulty.js';

export {
  recordChallengeEvent,
  drainChallengeMetrics,
  mergeChallengeMetrics,
  peekChallengeMetrics,
  resetChallengeMetrics,
  summarizeChallengeFields,
  solveMsBucketIndex,
  SOLVE_MS_BOUNDS
} from './metrics.js';

export {
  buildChallengePage,
  buildChallengeRedirect,
  challengePageCsp,
  buildSolverSource,
  issueChallengePayload,
  CHALLENGE_TTL_SEC,
  MAX_DIFFICULTY
} from './template.js';
