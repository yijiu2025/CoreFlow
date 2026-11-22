/**
 * 个人 API 令牌路由
 *
 * GET    /user/v1/tokens      — 我的令牌列表（只回 prefix，永不回哈希/明文）
 * POST   /user/v1/tokens      — 新建令牌（明文只在这一次响应里返回）
 * DELETE /user/v1/tokens/:id  — 吊销我的令牌（软删除，只能吊销自己的）
 *
 * 全部只要求登录：每个登录用户都能管自己的令牌，不需要额外权限码；
 * 用户维度只从 `request.state.user.userId` 取，**不接受**参数里的 userId。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import tokenService, { TokenServiceError } from '../../../app/user/services/token.service.js';

/**
 * 当前登录用户的数字主键
 *
 * 个人接口必须落到具体的人：M2M 凭证（没有 userId）不能代表任何人操作，
 * 匿名请求本来就会被守卫拦下；这里是给"有 sub 但没有 userId"的凭证兜底。
 *
 * @param {object} request Fastify 请求
 * @returns {number|null} 用户 ID
 */
function currentUserId(request) {
  const user = request.state?.user;
  if (!user?.sub) return null;
  const id = Number(user.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function registerTokenRoutes(fastify) {
  registerGroupMetadata({
    name: 'userTokens',
    alias: '访问令牌',
    description: '个人 API 令牌的查看、创建与吊销',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /user/v1/tokens
   * 我的令牌列表（含可选作用域清单，供前端多选）
   */
  registerSecureRoute(fastify, {
    name: 'listMyTokens',
    alias: '获取我的令牌列表',
    method: 'GET',
    url: '/tokens',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '当前凭证没有用户身份，请用账号登录后操作', data: null });
      }

      const data = await tokenService.list(userId);
      return reply.result.success('获取成功', data);
    }
  });

  /**
   * POST /user/v1/tokens
   * 新建令牌。响应里的 `token` 是明文，只出现这一次，前端必须提示用户立刻保存。
   */
  registerSecureRoute(fastify, {
    name: 'createMyToken',
    alias: '新建我的令牌',
    method: 'POST',
    url: '/tokens',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '当前凭证没有用户身份，请用账号登录后操作', data: null });
      }

      const { name, scopes, expiresInDays } = request.body || {};

      try {
        const created = await tokenService.create({ userId, name, scopes, expiresInDays });
        return reply.result.success('令牌已创建', created);
      } catch (err) {
        if (err instanceof TokenServiceError) {
          return reply.code(err.statusCode).send({ code: err.statusCode, message: err.message, data: null });
        }
        // 其余异常交给统一错误处理（不回显内部细节）
        throw err;
      }
    }
  });

  /**
   * DELETE /user/v1/tokens/:id
   * 吊销令牌（写 revoked_at，不物理删除）
   */
  registerSecureRoute(fastify, {
    name: 'revokeMyToken',
    alias: '吊销我的令牌',
    method: 'DELETE',
    url: '/tokens/:id',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '当前凭证没有用户身份，请用账号登录后操作', data: null });
      }

      const id = Number(request.params?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ code: 400, message: '令牌 ID 不合法', data: null });
      }

      try {
        await tokenService.revoke({ userId, id });
        return reply.result.success('令牌已删除', { id });
      } catch (err) {
        if (err instanceof TokenServiceError) {
          return reply.code(err.statusCode).send({ code: err.statusCode, message: err.message, data: null });
        }
        throw err;
      }
    }
  });
}

export default registerTokenRoutes;
