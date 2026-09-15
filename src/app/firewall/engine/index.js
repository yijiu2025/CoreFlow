/**
 * 防火墙引擎 barrel 导出
 * 统一暴露所有检测器、DAO、基础设施模块和请求管道函数
 *
 * 依赖方向：本文件只做 re-export，**不得**被 `engine/` 下的实现模块反向 import ——
 * 那会构造出 `index.js ↔ pipeline.js` 这样的循环依赖（曾真实存在）。
 * 实现模块请直接从各自的目标模块导入。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

// --- 检测器模块 ---
export { trackRequestCount, checkRateLimit } from './detectors/rate-limiter.js';
export { checkNotFoundTrap } from './detectors/scan-trap.js';
export { checkLoginBruteForce, isAccountLocked } from './detectors/brute-force.js';
export { checkGeoReputation, resolveGeoInfo } from './detectors/geo-filter.js';
export { checkBotChallenge } from './detectors/bot-detector.js';

// --- 封禁核心 ---
export {
  setBlock,
  removeBlock,
  setBlockFp,
  removeBlockFp,
  setBlockDevice,
  removeBlockDevice,
  setBlockForSubject,
  checkGlobalBlock
} from './dao/block-manager.js';

// --- 攻击告警 / 自动响应 ---
export { handleAttackEvent, notifyAttack, sendAlert } from './auto-responder.js';

// --- 公共工具（util 层） ---
export {
  trackConnection,
  getConnectionStats,
  cleanupStaleConnections,
  startCleanupTask
} from '../util/connection-tracker.js';
export { generateFingerprint, generateDeviceFingerprint } from '../util/fingerprint.js';

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
