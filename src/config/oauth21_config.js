/**
 * OAuth 2.1 服务默认值（令牌生命周期 / 授权码 / 模式开关 / 会话上限）
 *
 * ⚠️ 本文件只放**值**（叶子模块，禁止 import 任何 src 代码，见 config-leaf 守护测试）。
 * 运行时覆盖与热改机制在 `src/framework/config/runtime.js`：
 * 改 `src/data/oauth21_config.json` 即可热生效（无需重启），本文件是兜底默认值。
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么 TTL 不归在 `jwt` 下（2026-11-03 重构）
 * ════════════════════════════════════════════════════════════════════
 * 原先四个 TTL 都挂在 `jwt:` 里，但只有 `id_token` 是真正的 JWT：
 *   - access / refresh TTL：**与签发格式无关**的凭据生命周期 ——
 *     默认 `jwt.enabled=false`（Session 模式）时依然生效，用于
 *     cookie maxAge、OAuth 响应的 expires_in、设备码流程的过期时间；
 *   - authorizationCode TTL：授权码是**一次性不透明码**（存库/Redis），
 *     与 JWT 签名毫无关系。
 * 因此按「功能」重新分组：tokens（令牌期）/ authorizationCode（授权码）/
 * jwt（仅模式开关）/ session（会话上限）。改 TTL 时不要再去 jwt 下找。
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
  // ── 令牌生命周期（秒）────────────────────────────────────────────
  // 与签发格式无关：JWT 模式用它算 exp，Session 模式用它算 cookie maxAge
  // 与响应体 expires_in —— 两条路径共用同一组值，避免"令牌说 10 分钟、
  // cookie 说 1 小时"这类不一致。
  tokens: {
    // access token 有效期。短 TTL + refresh 换取泄漏窗口小：
    // 10 分钟是「前端一次页面会话内不必刷新」与「泄漏后可用窗口」的折中。
    accessTokenTTL: 600,

    // refresh token 有效期：1 天。刻意比框架会话的长期 TTL 短 ——
    // OAuth 客户端（第三方应用）的长期授权风险高于自家前端。
    refreshTokenTTL: 86400,

    // id token 有效期：1 小时。**唯一真 JWT 专属**的 TTL（OIDC id_token），
    // 仅 jwt.enabled=true 时签发；过期需重走授权流程（不允许静默续期，避免身份漂移）。
    idTokenTTL: 3600
  },

  // ── 授权码（一次性不透明码，与 JWT 无关）─────────────────────────
  authorizationCode: {
    // 授权码有效期（秒）：10 分钟。授权码一次性，短窗口减少重放面。
    ttl: 600
  },

  // ── 签发模式开关 ────────────────────────────────────────────────
  jwt: {
    // true = 用 JWT 承载 access/id token；false（默认）= Session 认证。
    // 签名算法（RS256）是结构性常量、不是可调项，留在 app/oauth21/config/config.js
    enabled: false
  },

  // ── 会话上限 ────────────────────────────────────────────────────
  session: {
    // 每应用最大活跃 Session 数：超出时踢出最旧会话。
    // 默认 5 覆盖「同一应用多开几个浏览器」的正常场景。
    maxSessionsPerApp: 5
  }
};

export { OAUTH21_CONFIG };
