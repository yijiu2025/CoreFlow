/**
 * OAuth 2.1 认证模块主入口
 *
 * 组合子模块：
 * - authorize.js — 授权码流程（authorize/login/consent）
 * - login.js     — 直接登录（login/mini-login/consent/confirm）
 * - qr.js        — 扫码登录（qr/*）
 * - register.js  — 注册（mini-register）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { registerGroupMetadata } from '../../../guard.js';
import { getStore } from '../../../../framework/redis/index.js';
import registerAuthorizeRoutes from './authorize.js';
import registerLoginRoutes from './login.js';
import registerQrRoutes from './qr.js';
import registerRegisterRoutes from './register.js';

async function registerAuthRoutes(fastify) {
  const sessionStore = getStore('session');
  const qrStore = getStore('qr');

  // 🔴 受信父域白名单：与 app.js 的 CORS_ORIGINS 同一套（iframe 嵌入 SSO 的宿主应用）。
  // 此前写死 frame-ancestors 'self' *（任意站点可 iframe 嵌入登录/注册页 = 点击劫持/钓鱼）。
  const CORS_ORIGINS = (process.env.CORS_ORIGINS?.trim() || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // 安全头处理：允许特定页面被**受信白名单** iframe 嵌入
  fastify.addHook('onSend', (request, reply, payload, done) => {
    const isMini = request.url.includes('mini-login') || request.url.includes('mini-register');
    if (isMini) {
      // CSP frame-ancestors 优先级高于 X-Frame-Options；白名单为空时只允许同源
      const ancestors = CORS_ORIGINS.length ? `'self' ${CORS_ORIGINS.join(' ')}` : "'self'";
      reply.header('Content-Security-Policy', `frame-ancestors ${ancestors}`);
      reply.header('X-Frame-Options', 'SAMEORIGIN');
    }
    done();
  });

  // 注册路由组元数据
  registerGroupMetadata({
    name: 'auth',
    description: 'OAuth 2.1 授权流程',
    enabled: true,
    requireLogin: false
  });

  // 注册各子模块路由
  registerAuthorizeRoutes(fastify, sessionStore);
  registerLoginRoutes(fastify);
  registerQrRoutes(fastify, qrStore);
  registerRegisterRoutes(fastify);
}

export default registerAuthRoutes;
