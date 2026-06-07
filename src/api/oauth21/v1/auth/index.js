/**
 * OAuth 2.1 认证模块主入口
 *
 * 组合子模块：
 * - authorize.js — 授权码流程（authorize/login/consent）
 * - login.js     — 直接登录（login/mini-login/consent/confirm）
 * - qr.js        — 扫码登录（qr/*）
 * - register.js  — 注册（mini-register）
 */

import { registerGroupMetadata } from '../../../guard.js';
import { getSessionStore } from '../../../../redis/session-store.js';
import registerAuthorizeRoutes from './authorize.js';
import registerLoginRoutes from './login.js';
import registerQrRoutes from './qr.js';
import registerRegisterRoutes from './register.js';

export default async function (fastify) {
  const sessionStore = getSessionStore(fastify, 'session');
  const qrStore = getSessionStore(fastify, 'qr');

  // 安全头处理：允许特定页面被 iframe 嵌入
  fastify.addHook('onSend', (request, reply, payload, done) => {
    const isMini =
      request.url.includes('mini-login') ||
      request.url.includes('mini-register');
    if (isMini) {
      reply.header('X-Frame-Options', 'ALLOWALL');
      reply.header('Content-Security-Policy', "frame-ancestors 'self' *");
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
