// src/config/config.js
import 'dotenv/config';

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    issuer: process.env.ISSUER || 'http://localhost:3000'
  },
  jwt: {
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
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret'
  }
};

export default config;
