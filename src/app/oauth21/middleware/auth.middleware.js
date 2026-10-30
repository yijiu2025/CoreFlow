/**
 * OAuth 2.1 业务中间件
 * 仅负责 OAuth21 特有的业务逻辑：
 * - H5 签名验证 (verifySignature)
 * - Scope 校验 (checkScope)
 *
 * 通用身份验证（Token 提取、JWT 验证、Session 管理）由 src/auth/ 处理
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import fp from 'fastify-plugin';
import { verifySignature } from '../../../framework/auth/signature.js';

/**
 * 注册 OAuth2.1 业务中间件
 * - preHandler: H5 签名验证（仅对 requireSignature 路由生效）
 *
 * 🔴 **作用域限定在 /oauth2.1**（U4）
 * `fp` 会打破 Fastify 封装、把钩子提到根作用域 —— 路由本身是全应用共享的，
 * 而 `requireLogin` 会自动给路由打上 `requireSignature`（见 api/guard.js），
 * 若不做前缀闸门，接上这个中间件就等于**要求所有前端的登录态请求都带 H5 签名**，
 * 而实现签名拦截器的目前只有 oauth21 自己（oauth21/src/utils/request.ts）。
 * 因此这里显式只处理 /oauth2.1 前缀内的请求：作用域内被漏掉的签名校验补上，
 * 作用域外保持现状（由各自的网关/防火墙策略负责）。
 */
const OAUTH21_SCOPE_PREFIX = '/oauth2.1';

/** 请求是否属于 oauth21 作用域（避免 `/oauth2.10` 这类同前缀误命中） */
function isOAuth21Request(url = '') {
  return url === OAUTH21_SCOPE_PREFIX || url.startsWith(`${OAUTH21_SCOPE_PREFIX}/`);
}

const initOAuthMiddleware = fp(async function (app) {
  // H5 签名验证拦截器
  app.addHook('preHandler', async (request, reply) => {
    if (!isOAuth21Request(request.url)) return;
    if (request.url.startsWith('/assets') || request.url === '/favicon.ico') {
      return;
    }
    await verifySignature(request, reply);
  });
});

/**
 * Scope 校验工具函数
 * 在 preHandler 中使用，检查已认证用户是否拥有指定权限范围。
 *
 * @param {...string} requiredScopes 需要的 scope 列表
 * @returns {Function} Fastify preHandler 钩子
 */
function checkScope(...requiredScopes) {
  return async function scopeGuard(request, reply) {
    const user = request.state?.user;

    if (!user?.scope) {
      return reply.code(403).send({
        error: 'insufficient_scope',
        error_description: 'No scope found in token'
      });
    }

    const userScopes = user.scope.split(' ');
    const hasAll = requiredScopes.every(s => userScopes.includes(s));

    if (!hasAll) {
      return reply.code(403).send({
        error: 'insufficient_scope',
        required: requiredScopes.join(' ')
      });
    }
  };
}

export { initOAuthMiddleware, checkScope, isOAuth21Request, OAUTH21_SCOPE_PREFIX };
