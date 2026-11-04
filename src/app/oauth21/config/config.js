/**
 * OAuth2.1 应用配置（JWT/Session 模式、TTL、issuer 等）
 *
 * 分层（2026-11-03 起）：
 *   - **TTL / 上限等调优值** → `src/config/oauth21_config.js`（tokens / authorizationCode /
 *     jwt / session 四组，按功能划分）
 *   - **运行时覆盖** → `data/oauth21_config.json`（**热改，无需重启**）
 *   - **部署差异** → 仍走 env：PORT / ISSUER / SESSION_SECRET
 *
 * ⚠️ 热改实现：`runtime.bind(config)` 在覆盖文件变化时原地更新本对象，
 * 消费方（jwt.js / cookies.service.js 等）每次使用时读 `config.tokens.*` /
 * `config.authorizationCode.*` 即可热生效。
 *
 * @author yijiu2025
 * @since 2026-08-17；2026-11-03 调优值迁出 env 并支持热改
 */
import 'dotenv/config';
import { createRuntimeConfig } from '../../../framework/config/runtime.js';
import { loadOverrides } from '../../../framework/config/overrides.js';
import { AUTH_SESSION_DEFAULTS, authJwtEnabled } from '../../../framework/auth/session/session-config.js';

/**
 * core 保底默认值（改内置默认才动这里；按部署微调写 src/config/oauth21_config.js，
 * 运行期热改写 data/oauth21_config.json）
 */
const OAUTH21_DEFAULTS = {
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

  // ── 会话上限 ────────────────────────────────────────────────────
  session: {
    // 每应用最大活跃 Session 数：超出时踢出最旧会话。
    // 默认 5 覆盖「同一应用多开几个浏览器」的正常场景。
    maxSessionsPerApp: 5
  }
};

/** src/config/oauth21_config.js 的静态覆盖（可选；缺失则为 {}） */
const OVERRIDES = loadOverrides('oauth21_config.js', 'OAUTH21_CONFIG');

const BASE = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    // OIDC 发现文档与 JWT iss claim 的根地址（含 /oauth2.1 前缀），必须与实际入口一致
    issuer: process.env.ISSUER || 'http://localhost:3000/oauth2.1'
  },
  // 令牌生命周期：与签发格式无关（JWT 算 exp / Session 算 cookie maxAge 共用）
  tokens: { ...OAUTH21_DEFAULTS.tokens, ...OVERRIDES.tokens },
  // 授权码：一次性不透明码，与 JWT 无关，独立成组
  authorizationCode: { ...OAUTH21_DEFAULTS.authorizationCode, ...OVERRIDES.authorizationCode },
  jwt: {
    // JWT 总开关唯一来源：framework/auth（core 保底 false + src/config/auth_config.js 覆盖）。
    // ⚠️ 不要在本文件再定义一份 —— 曾经 framework 校验读 env、这里读配置，
    // 两处判断不一致会导致"签发了 JWT 但校验不认"。
    enabled: authJwtEnabled(),
    // 签名算法是结构性常量（不可调），不放进 src/config/
    algorithm: 'RS256'
  },
  pkce: {
    required: true,
    codeVerifierLength: 128
  },
  device: {
    codeLength: 8,
    interval: 5,
    expiresIn: 600
  },
  session: {
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret',
    // 与框架会话层共用同一个旋钮（src/config/auth_config.js 的 session.maxRefreshTokens）
    maxRefreshTokens: AUTH_SESSION_DEFAULTS.session.maxRefreshTokens
  }
};

const runtime = createRuntimeConfig({ name: 'oauth21', defaults: BASE });

const config = runtime.bind({});

export default config;
