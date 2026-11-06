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
function registerAuthorizeRoutes(fastify, sessionStore) {
  // GET /authorize — 授权请求入口
  registerSecureRoute(fastify, {
    name: 'authorize',
    alias: '授权请求入口',
    method: 'GET',
    url: '/authorize',
    handler: (request, reply) => authService.handleAuthorize(request, reply, sessionStore)
  });

  // POST /authorize/login — 用户登录验证
  //
  // `credentialRoute: true` 不能少：这条路由校验 username/password（失败返 401），
  // 与 `/login` 是同一类「消费凭证」的端点。旧版靠路径正则的 `$` 后缀匹配侥幸覆盖到了它，
  // 但那是巧合 —— 改成路由声明后这里是显式的（见 `login.js` 头注释）。
  registerSecureRoute(fastify, {
    name: 'authorizeLogin',
    alias: '授权登录验证',
    method: 'POST',
    url: '/authorize/login',
    schema: authorizeLoginSchema,
    config: { firewall: { credentialRoute: true } },
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

export default registerAuthorizeRoutes;
