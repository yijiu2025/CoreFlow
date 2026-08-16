/**
 * 登录路由
 *
 * POST /login              — 标准直接登录
 * POST /mini-login         — 快捷登录（允许 iframe 嵌入）
 * POST /login/consent/confirm — 快捷登录确认授权
 *
 * 业务逻辑见 app/oauth21/services/login.service.js（directLogin / confirmDirectConsent）。
 */
import { registerSecureRoute } from '../../../guard.js';
import { directLogin, confirmDirectConsent } from '../../../../app/oauth21/services/login.service.js';
import { loginSchema, consentConfirmSchema } from '../schemas/login.js';

export default function registerLoginRoutes(fastify) {
  // POST /login — 标准直接登录
  registerSecureRoute(fastify, {
    name: 'login',
    alias: '标准登录',
    method: 'POST',
    url: '/login',
    schema: loginSchema,
    handler: (request, reply) => directLogin(request, reply, fastify)
  });

  // POST /mini-login — 快捷登录 (允许 iframe 嵌入)
  registerSecureRoute(fastify, {
    name: 'miniLogin',
    alias: '快捷登录',
    method: 'POST',
    url: '/mini-login',
    schema: loginSchema,
    handler: (request, reply) => directLogin(request, reply, fastify)
  });

  // POST /login/consent/confirm — 快捷登录确认授权
  registerSecureRoute(fastify, {
    name: 'confirmDirectConsent',
    alias: '统一直接登录确认授权',
    method: 'POST',
    url: '/login/consent/confirm',
    schema: consentConfirmSchema,
    handler: (request, reply) => confirmDirectConsent(request, reply, fastify)
  });
}
