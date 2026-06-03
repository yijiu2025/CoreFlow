// src/index.js
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import config from './config/config.js';
import { generateKeyPair } from './crypto/keys.js';
import { oauthErrorHandler } from './middleware/error.middleware.js';

import authRoutes from './routes/auth.routes.js';
import tokenRoutes from './routes/token.routes.js';
import oidcRoutes from './routes/oidc.routes.js';
import deviceRoutes from './routes/device.routes.js';
import adminRoutes from './routes/admin.routes.js';

// ESM 中没有 __dirname，手动构造
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─── 安全中间件 ───
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));

// ─── 请求解析 ───
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── 简易 Cookie 解析 ───
app.use((req, _res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [key, val] = pair.trim().split('=');
      if (key && val) req.cookies[key] = decodeURIComponent(val);
    }
  }
  next();
});

// ─── 限流 ───
const tokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: { error: 'rate_limited', error_description: 'Too many requests' }
});
app.use('/token', tokenLimiter);
app.use('/device/token', tokenLimiter);

// ─── 视图引擎 ───
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── 路由 ───
app.use(authRoutes);
app.use(tokenRoutes);
app.use(oidcRoutes);
app.use(deviceRoutes);
app.use(adminRoutes);

// ─── 健康检查 ───
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    issuer: config.server.issuer,
    timestamp: new Date().toISOString()
  });
});

// ─── 错误处理 ───
app.use(oauthErrorHandler);

// ─── 启动 ───
function start() {
  const line = '='.repeat(60);

  console.log(line);
  console.log('  OAuth 2.1 Authorization Center  (ESM)');
  console.log(line);

  generateKeyPair();

  app.listen(config.server.port, () => {
    const i = config.server.issuer;
    console.log(`\n  Server: ${i}`);
    console.log('\n  Endpoints:');
    console.log(`    Authorization   GET  ${i}/authorize`);
    console.log(`    Token           POST ${i}/token`);
    console.log(`    UserInfo        GET  ${i}/userinfo`);
    console.log(`    JWKS            GET  ${i}/.well-known/jwks.json`);
    console.log(
      `    Discovery       GET  ${i}/.well-known/openid-configuration`
    );
    console.log(`    Device Auth     POST ${i}/device/code`);
    console.log(`    Revoke          POST ${i}/revoke`);
    console.log(`    Health          GET  ${i}/health`);
    console.log('\n  Test credentials:');
    console.log('    User:    alice / password123');
    console.log('    SPA:     spa-client-001  (public, PKCE)');
    console.log('    Server:  server-client-001  (confidential)');
    console.log('    M2M:     m2m-client-001  (client_credentials)');
    console.log(line);
  });
}

start();
