/**
 * 授权路由
 *
 * GET  /authorize         — 授权请求入口
 * POST /authorize/login   — 用户登录验证
 * POST /authorize/consent — 用户授权确认
 *
 * 业务逻辑见 app/oauth21/services/authorization.service.js
 * （handleAuthorize / handleAuthorizeLogin / handleAuthorizeConsent）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerSecureRoute } from '../../../guard.js';
import { AuthorizationService } from '../../../../app/oauth21/services/authorization.service.js';
import { authorizeLoginSchema, authorizeConsentSchema } from '../schemas/authorize.js';

const authService = new AuthorizationService();

/**
 * 注册授权路由
 */
export default function registerAuthorizeRoutes(fastify, sessionStore) {
  // GET /authorize — 授权请求入口
  registerSecureRoute(fastify, {
    name: 'authorize',
    alias: '授权请求入口',
    method: 'GET',
    url: '/authorize',
    handler: (request, reply) => authService.handleAuthorize(request, reply, sessionStore)
  });

  // POST /authorize/login — 用户登录验证
  registerSecureRoute(fastify, {
    name: 'authorizeLogin',
    alias: '授权登录验证',
    method: 'POST',
    url: '/authorize/login',
    schema: authorizeLoginSchema,
    handler: (request, reply) => authService.handleAuthorizeLogin(request, reply, sessionStore)
  });

  // POST /authorize/consent — 用户授权确认
  registerSecureRoute(fastify, {
    name: 'authorizeConsent',
    alias: '授权确认',
    method: 'POST',
    url: '/authorize/consent',
    schema: authorizeConsentSchema,
    handler: (request, reply) => authService.handleAuthorizeConsent(request, reply, sessionStore)
  });
}
