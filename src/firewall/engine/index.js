/**
 * 防火墙引擎 barrel 导出
 * 统一暴露所有检测器、DAO、基础设施模块和请求管道函数
 */

// --- 检测器模块 ---
export { trackRequestCount, checkRateLimit } from './detectors/rate-limiter.js';
export { checkNotFoundTrap } from './detectors/scan-trap.js';
export { checkLoginBruteForce, isAccountLocked } from './detectors/brute-force.js';
export { checkGeoReputation, resolveGeoInfo } from './detectors/geo-filter.js';
export { checkBotChallenge } from './detectors/bot-detector.js';

// --- 封禁核心 ---
export {
  setBlock, removeBlock,
  checkGlobalBlock
} from './dao/block-manager.js';

// --- 公共工具（util 层） ---
export { trackConnection, getConnectionStats, cleanupStaleConnections, startCleanupTask } from '../util/connection-tracker.js';
export { generateFingerprint } from '../util/fingerprint.js';

// --- 请求管道 ---
export {
  shouldSkipDeepCheck,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  recordLog
} from './pipeline.js';
