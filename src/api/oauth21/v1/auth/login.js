/**
 * 登录路由
 *
 * POST /login              — 标准直接登录
 * POST /mini-login         — 快捷登录（允许 iframe 嵌入）
 * POST /login/consent/confirm — 快捷登录确认授权
 * POST /login/verify-email — 邮箱二次验证登录
 *
 * 业务逻辑见 app/oauth21/services/login.service.js（directLogin / confirmDirectConsent）。
 *
 * ## `config.firewall.credentialRoute`：这个路由消费凭证
 *
 * 防火墙的暴力破解防护挂在 `onResponse` 上观测登录结果（app 之间不互相依赖，
 * 所以 firewall 不 import 这里的服务）。哪些路由算「登录」由**本文件声明**，
 * 防火墙读 `request.routeOptions.config` 判定 —— 改名/换前缀都不会让计数悄悄失效。
 *
 * ⚠️ 新增登录端点（短信登录、扫码登录…）时**必须**补这一行，否则该端点的失败尝试
 * 不进爆破计数（静默的，没有任何报错）。`login-brute-force-wiring.test.js` 会对账
 * "长得像登录的路由是否都声明了"，漏了会红。
 *
 * `/login/consent/confirm` **不声明**：它是已认证后的授权确认，不校验密码，
 * 它的 403 是"用户拒绝了授权"，不是凭证失败。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-06 三条凭证路径改为路由声明 `firewall.credentialRoute`（原先是路径正则）
 */
import { registerSecureRoute } from '../../../guard.js';
import { directLogin, confirmDirectConsent, verifyEmailLogin } from '../../../../app/oauth21/services/login.service.js';
import { loginSchema, consentConfirmSchema, verifyEmailLoginSchema } from '../schemas/login.js';

function registerLoginRoutes(fastify) {
  // POST /login — 标准直接登录
  registerSecureRoute(fastify, {
    name: 'login',
    alias: '标准登录',
    method: 'POST',
    url: '/login',
    schema: loginSchema,
    // 🔴 端点级限流是唯一生效的那层：全局限流默认关闭（defense.enableRateLimit=false），
    // 本端点此前完全没有 `config.rateLimit`，只剩"图形验证码 + 账号锁"两道应用层判定。
    config: { firewall: { credentialRoute: true }, rateLimit: { max: 20, timeWindow: '1 minute', groupId: 'login' } },
    handler: (request, reply) => directLogin(request, reply, fastify)
  });

  // POST /mini-login — 快捷登录 (允许 iframe 嵌入)
  registerSecureRoute(fastify, {
    name: 'miniLogin',
    alias: '快捷登录',
    method: 'POST',
    url: '/mini-login',
    schema: loginSchema,
    // iframe 快捷登录与 /login 共用同一套凭证校验，同样需要自己的桶（groupId 隔离）
    config: {
      firewall: { credentialRoute: true },
      rateLimit: { max: 20, timeWindow: '1 minute', groupId: 'mini-login' }
    },
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

  // POST /login/verify-email — 邮箱二次验证登录（环境异常后二次确认）
  registerSecureRoute(fastify, {
    name: 'verifyEmailLogin',
    alias: '邮箱二次验证登录',
    method: 'POST',
    url: '/login/verify-email',
    schema: verifyEmailLoginSchema,
    // 邮箱二次验证同样吃凭证（verifyToken + 6 位码），必须独立限流：
    // 没有它，6 位码在 TTL 内可被高速撞库（服务端虽有尝试上限，但那是应用层最后一道）
    config: {
      firewall: { credentialRoute: true },
      rateLimit: { max: 10, timeWindow: '1 minute', groupId: 'login-verify-email' }
    },
    handler: (request, reply) => verifyEmailLogin(request, reply, fastify)
  });
}

export default registerLoginRoutes;
