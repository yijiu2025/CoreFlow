/**
 * OAuth2.1 应用配置（JWT/Session 模式、TTL、issuer 等）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import 'dotenv/config';

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    issuer: process.env.ISSUER || 'http://localhost:3000/oauth2.1'
  },
  jwt: {
    enabled: process.env.JWT_ENABLED === 'true', // 默认关闭，使用 Session 认证
    accessTokenTTL: parseInt(process.env.ACCESS_TOKEN_TTL) || 600,
    refreshTokenTTL: parseInt(process.env.REFRESH_TOKEN_TTL) || 86400,
    idTokenTTL: parseInt(process.env.ID_TOKEN_TTL) || 3600,
    authorizationCodeTTL: parseInt(process.env.AUTH_CODE_TTL) || 600,
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
    maxRefreshTokens: parseInt(process.env.MAX_REFRESH_TOKENS) || 10
  }
};

export default config;
