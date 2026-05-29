/**
 * OAuth 2.1 业务中间件
 * 仅负责 OAuth21 特有的业务逻辑：
 * - H5 签名验证 (verifySignature)
 * - Scope 校验 (checkScope)
 *
 * 通用身份验证（Token 提取、JWT 验证、Session 管理）由 src/auth/ 处理
 */
import fp from 'fastify-plugin';
import { verifySignature } from '../../api/oauth21/v1/signature.js';

/**
 * 注册 OAuth2.1 业务中间件
 * - preHandler: H5 签名验证（仅对 requireSignature 路由生效）
 */
export const initOAuthMiddleware = fp(async function (app) {
  // H5 签名验证拦截器
  app.addHook('preHandler', async (request, reply) => {
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
export function checkScope(...requiredScopes) {
  return async function scopeGuard(request, reply) {
    const user = request.state?.user;

    if (!user?.scope) {
      return reply.code(403).send({
        error: 'insufficient_scope',
        error_description: 'No scope found in token'
      });
    }

    const userScopes = user.scope.split(' ');
    const hasAll = requiredScopes.every((s) => userScopes.includes(s));

    if (!hasAll) {
      return reply.code(403).send({
        error: 'insufficient_scope',
        required: requiredScopes.join(' ')
      });
    }
  };
}
