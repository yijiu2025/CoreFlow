/**
 * 个人第三方账号绑定路由
 *
 * GET    /user/v1/identities      — 我的绑定列表 + 可绑定 provider 清单
 * DELETE /user/v1/identities/:id  — 解绑（只能解绑自己的；唯一登录方式会被拒绝）
 *
 * 只要求登录：个人数据按 `request.state.user.userId` 过滤，不接受参数里的 userId。
 * 本期不提供绑定入口 —— 绑定需要各 provider 的授权回调，未接入前不在页面上放假按钮。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import identityService, { IdentityServiceError } from '../../../app/user/services/identity.service.js';

/**
 * 当前登录用户的数字主键
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

async function registerIdentityRoutes(fastify) {
  registerGroupMetadata({
    name: 'userIdentities',
    alias: '第三方账号',
    description: '第三方账号绑定查看与解绑',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /user/v1/identities
   * 我的绑定列表 + 可绑定 provider（未接入的带原因）
   */
  registerSecureRoute(fastify, {
    name: 'listMyIdentities',
    alias: '获取我的第三方绑定',
    method: 'GET',
    url: '/identities',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '当前凭证没有用户身份，请用账号登录后操作', data: null });
      }

      const data = await identityService.list(userId);
      return reply.result.success('获取成功', data);
    }
  });

  /**
   * DELETE /user/v1/identities/:id
   * 解绑第三方账号
   */
  registerSecureRoute(fastify, {
    name: 'unbindMyIdentity',
    alias: '解绑我的第三方账号',
    method: 'DELETE',
    url: '/identities/:id',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '当前凭证没有用户身份，请用账号登录后操作', data: null });
      }

      const id = Number(request.params?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ code: 400, message: '绑定 ID 不合法', data: null });
      }

      try {
        await identityService.unbind({ userId, id });
        return reply.result.success('已解绑', { id });
      } catch (err) {
        if (err instanceof IdentityServiceError) {
          return reply.code(err.statusCode).send({ code: err.statusCode, message: err.message, data: null });
        }
        throw err;
      }
    }
  });
}

export default registerIdentityRoutes;
