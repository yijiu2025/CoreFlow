/**
 * 防火墙引擎 barrel 导出
 * 只暴露**引擎自身**的能力：检测器、自动响应、请求管道。
 *
 * 边界（2026-09-16 收敛）：
 *   - 封禁/白名单的读写属于 `dao/` 层，**不再**从这里转发。此前本文件转出
 *     `setBlock / setBlockFp / setBlockDevice / checkGlobalBlock` 一整组函数，
 *     纯粹是为了给 `services/` 等外部消费者开后门 —— 那让"引擎"假装成存储层入口。
 *     需要封禁能力请直接 `import from '../dao/block-manager.js'`。
 *   - `util/` 层的工具（连接追踪、指纹）同样不再转发，直接依赖目标模块。
 *
 * 依赖方向：本文件只做 re-export，**不得**被 `engine/` 下的实现模块反向 import ——
 * 那会构造出 `index.js ↔ pipeline.js` 这样的循环依赖（曾真实存在）。
 * 实现模块请直接从各自的目标模块导入。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-16 移出封禁核心与 util 工具转发，职责收敛为「引擎能力」
 */

// --- 检测器模块 ---
export { trackRequestCount, checkRateLimit } from './detectors/rate-limiter.js';
export { checkNotFoundTrap } from './detectors/scan-trap.js';
export { checkLoginBruteForce, isAccountLocked } from './detectors/brute-force.js';
export { checkGeoReputation, resolveGeoInfo } from './detectors/geo-filter.js';
export { checkBotChallenge } from './detectors/bot-detector.js';

// --- 攻击告警 / 自动响应 ---
export { handleAttackEvent, notifyAttack, sendAlert } from './auto-responder.js';

// --- 请求管道 ---
export {
  CHALLENGE_VERIFY_PATH,
  isChallengeVerifyUrl,
  shouldSkipDeepCheck,
  willBeRejectedAsAnonymous,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  observeLoginOutcome,
  recordLog
} from './pipeline.js';
