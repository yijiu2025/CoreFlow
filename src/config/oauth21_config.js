/**
 * OAuth 2.1 服务默认值（JWT / 授权码 TTL、会话上限）
 *
 * ⚠️ 本文件只放**值**（叶子模块，禁止 import 任何 src 代码，见 config-leaf 守护测试）。
 * 运行时覆盖与热改机制在 `src/framework/config/runtime.js`：
 * 改 `src/data/oauth21_config.json` 即可热生效（无需重启），本文件是兜底默认值。
 *
 * **部署差异仍走 env**（每部署不同，不适合进仓库内的默认值文件）：
 *   PORT / ISSUER（OIDC 发现文档与 JWT iss claim 的根地址）/ SESSION_SECRET
 *
 * env 兜底已退役（2026-11-03）：JWT_ENABLED / ACCESS_TOKEN_TTL / REFRESH_TOKEN_TTL /
 * ID_TOKEN_TTL / AUTH_CODE_TTL / MAX_SESSIONS_PER_APP 不再读环境变量；
 * MAX_REFRESH_TOKENS 与框架会话层共用 `src/config/auth_config.js` 的
 * session.maxRefreshTokens（同一个旋钮只留一份来源）。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */
const OAUTH21_CONFIG = {
  jwt: {
    // true = 用 JWT 认证；false（默认）= Session 认证
    enabled: false,

    // access token 有效期（秒）。短 TTL + refresh 换取泄漏窗口小：
    // 10 分钟是「前端一次页面会话内不必刷新」与「泄漏后可用窗口」的折中。
    accessTokenTTL: 600,

    // refresh token 有效期（秒）：1 天。与框架会话的 LONG TTL 不同，
    // 这里刻意更短 —— OAuth 客户端（第三方应用）的长期授权风险高于自家前端。
    refreshTokenTTL: 86400,

    // id token 有效期（秒）：1 小时，随 access token 一起用于前端展示身份，
    // 过期后需重新走授权流程（不允许静默续期，避免身份漂移）。
    idTokenTTL: 3600,

    // 授权码有效期（秒）：10 分钟。授权码一次性，短窗口减少重放面。
    authorizationCodeTTL: 600
  },

  session: {
    // 每应用最大活跃 Session 数：超出时踢出最旧会话。
    // 默认 5 覆盖「同一应用多开几个浏览器」的正常场景。
    maxSessionsPerApp: 5
  }
};

export { OAUTH21_CONFIG };
