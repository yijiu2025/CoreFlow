/**
 * OAuth2.1 应用配置（JWT/Session 模式、TTL、issuer 等）
 *
 * 分层（2026-11-03 起）：
 *   - **TTL / 上限等调优值** → `src/config/oauth21_config.js`（tokens / authorizationCode /
 *     jwt / session 四组，按功能划分）
 *   - **运行时覆盖** → `src/data/oauth21_config.json`（**热改，无需重启**）
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
import { OAUTH21_CONFIG } from '../../../config/oauth21_config.js';
import { AUTH_CONFIG } from '../../../config/auth_config.js';

const BASE = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    // OIDC 发现文档与 JWT iss claim 的根地址（含 /oauth2.1 前缀），必须与实际入口一致
    issuer: process.env.ISSUER || 'http://localhost:3000/oauth2.1'
  },
  // 令牌生命周期：与签发格式无关（JWT 算 exp / Session 算 cookie maxAge 共用）
  tokens: { ...OAUTH21_CONFIG.tokens },
  // 授权码：一次性不透明码，与 JWT 无关，独立成组
  authorizationCode: { ...OAUTH21_CONFIG.authorizationCode },
  jwt: {
    ...OAUTH21_CONFIG.jwt,
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
    maxRefreshTokens: AUTH_CONFIG.session.maxRefreshTokens
  }
};

const runtime = createRuntimeConfig({ name: 'oauth21', defaults: BASE });

const config = runtime.bind({});

export default config;
