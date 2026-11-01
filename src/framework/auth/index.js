/**
 * auth 模块唯一对外门面（纯 re-export，零业务逻辑）
 *
 * 默认导出 = Fastify 插件（实现在 ./plugin.js，loader 04-auth.js 注册）；
 * 命名导出 = 全部公开能力的分类收拢（每类只从权威源文件 re-export 一次，禁重复）。
 *
 * 业务代码统一 `import { xxx } from '<相对路径>/framework/auth/index.js'`；
 * auth 内部模块互相 import 走具体文件，禁反向 import 本文件（会成环）。
 * 各文件职责详见同目录 README.md。
 *
 * @author yijiu
 * @since 2026-07-13
 * @since 2026-11-01 业务实现拆至 plugin.js / bearer-auth.js / context/accessors.js / risk/risk-hooks.js，
 *                   本文件收敛为纯门面
 */

// 0. 默认导出：Fastify 认证插件
export { default } from './plugin.js';

// 1. 请求上下文（ALS）——供业务层在任意深度取 request / db / 插件实例
export { requestContext } from './context/request-context.js';
export { getCtx, getDb, getServerResource } from './context/accessors.js';

// 2. 会话生命周期（session.js 是聚合门面；store/saga 是 Redis 底座与事务）
export {
  createSession,
  getSession,
  refreshSession,
  switchSessionByRefreshToken,
  destroySession,
  revokeRememberMe,
  updateRememberMe,
  updateSessionBaseline,
  getSessionTokenDevice
} from './session/session.js';
export { refreshSessionCore } from './session/session-refresh.js';
export {
  MAX_REFRESH_TOKENS,
  MAX_ACTIVE_DEVICES,
  sessionStore,
  refreshStore,
  userRefreshStore,
  rotatedStore,
  familyStore,
  userSessionsStore,
  kickTombStore,
  permStore,
  sidHash,
  deleteRefreshTokensForSession,
  revokeFamily,
  getSessionUser,
  isSessionUserActive,
  revokeDisabledSession
} from './session/session-store.js';
export { runSessionSaga, withSessionTransaction } from './session/session-saga.js';

// 3. 会话治理 / 踢出 / Cookie 绑定与切号 / 会话内权限解析
export {
  checkMaxSessions,
  pruneActiveDevices,
  pruneStaleSessionTokens,
  getSessionStats,
  getLoginTrend,
  logLoginFailure
} from './session/session-governance.js';
export {
  kickByDeviceType,
  kickByDeviceId,
  kickSession,
  kickAllSessions,
  kickUser,
  kickSessionsByIds,
  getKickTombstone,
  kickCodeOf
} from './session/session-kick.js';
export {
  bindTokenToCookie,
  bindSessionToCookie,
  clearAuthCookies,
  updateRememberMeCookies,
  switchAccount,
  removeSavedAccount
} from './session/session-api.service.js';
export { resolveSessionPermissions } from './session/session-perm.js';

// 4. 权限（PBAC）——缓存+指纹快照 与 逐请求加载 两条路
export {
  PERM_NAMESPACE,
  PERM_TTL,
  buildPermKey,
  computePermFingerprint,
  getPermissions,
  invalidatePermCache,
  normalizeTs,
  warmPermissions
} from './permission/perm-cache.js';
export { loadUserPermissions } from './permission/permission-loader.js';

// 5. 设备——设备 ID/类型/指纹 与 设备 ID 服务端签发/校验
export {
  DEVICE_TYPE,
  detectDeviceType,
  getDeviceId,
  getDeviceIdAndWrapResponse,
  getClientDeviceId,
  computeDeviceFingerprint
} from './device/device.js';
export {
  validateDeviceId,
  verifyAndNormalizeDeviceId,
  parseDeviceId,
  generateServerSideDeviceId,
  detectPlatform,
  decodeTimestamp
} from './device/device-id-service.js';

// 6. 风控——登录/会话异常检测、人机验证、锁定清理、请求生命周期接线
export {
  DETECT_RESULT,
  detectLoginAnomaly,
  detectLoginEnvironmentAnomaly,
  detectSessionRisk,
  confirmVerifyToken,
  hasVerifiedFlag,
  isHighRiskRequest,
  clearAccountLock,
  clearIpLock
} from './risk/anomaly-detector.js';

// 7. 账号安全——封禁 / 密码哈希与策略 / 两步验证 / 二级验证保险箱 / H5 签名 / Origin 白名单
export {
  BAN_SERVICE_LOGIN,
  BAN_SERVICE_ACCESS,
  disable,
  disableLevel,
  untieDisable,
  isDisable,
  checkDisable,
  getDisableTime,
  getDisableLevel,
  checkDisableLevel,
  isDisableLevel
} from './security/ban.js';
export { hashPassword, verifyPassword, isLegacyHash } from './security/password-hash.js';
export { validatePasswordStrength, isPasswordReused, checkPasswordAge } from './security/password-policy.js';
export { generateSecret, generateTOTP, verifyTOTP } from './security/totp.js';
export {
  DEFAULT_SAFE_TIME,
  openSafe,
  isSafe,
  checkSafe,
  closeSafe,
  getSafeTime,
  getSafeInfo,
  createSafePreHandler
} from './security/safe.js';
export { verifySignature, issueH5Token } from './security/signature.js';
export { isAllowedOrigin } from './security/origin-guard.js';

// 8. Cookie 签名与策略（session 双令牌的 Cookie 载体）
export {
  signCookie,
  verifyCookie,
  COOKIE_OPTIONS,
  COOKIE_POLICY,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL,
  REFRESH_COOKIE_PATH,
  ROTATED_RETENTION,
  COOKIE_SID,
  COOKIE_SID_R,
  USER_COOKIE_OPTS,
  USER_COOKIE_TTL,
  accountKeyForUid
} from './context/cookie.js';

// 9. 审计 / 事件
export {
  logAuditEvent,
  getAuditLogs,
  logLogin,
  logLogout,
  logKick,
  logPasswordChange,
  logRegister
} from './audit/audit-logger.js';
export { AUTH_EVENTS, onAuthEvent, emitAuthEvent, removeAllAuthListeners } from './audit/events.js';

// 10. 权限工具类（app.decorate('auth') 装饰的同一个实例）
export { default as StpUtil } from './context/stp-util.js';
