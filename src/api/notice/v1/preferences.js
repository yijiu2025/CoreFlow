/**
 * 个人通知偏好接口
 *
 * GET /notice/v1/preferences —— 本人「事件 × 渠道」矩阵（未设置的格按全局/默认补齐）
 * PUT /notice/v1/preferences —— 批量保存本人的偏好与免打扰时段
 *
 * 🔴 用户身份**只**取 `request.state.user.userId`（认证写入的数字主键），绝不接受
 * 请求体/查询串里的 userId —— 那等于把"改别人的通知设置"做成一个参数。
 * 接口只要求登录（不挂管理权限码）：通知偏好是每个人的基础设置。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import * as preferenceService from '../../../app/notice/services/preference.service.js';

/**
 * 取当前登录用户的数字主键
 *
 * @param {import('fastify').FastifyRequest} request 请求
 * @returns {number|null} 用户主键；客户端凭证（无用户上下文）为 null
 */
function currentUserId(request) {
  const userId = request.state?.user?.userId;
  return userId === null || userId === undefined ? null : Number(userId);
}

async function registerPreferenceRoutes(fastify) {
  registerGroupMetadata({
    name: 'noticePreferences',
    alias: '通知个人偏好',
    description: '本人通知开关与免打扰时段',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'noticeGetPreferences',
    alias: '获取个人通知偏好',
    method: 'GET',
    url: '/preferences',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (userId === null) return reply.result.unauth('当前凭证没有用户身份');

      const data = await preferenceService.listForUser(userId);
      return reply.result.success('获取成功', data);
    }
  });

  registerSecureRoute(fastify, {
    name: 'noticeSavePreferences',
    alias: '保存个人通知偏好',
    method: 'PUT',
    url: '/preferences',
    requireLogin: true,
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              required: ['eventCode', 'channel', 'enabled'],
              properties: {
                eventCode: { type: 'string', minLength: 1, maxLength: 64 },
                channel: { type: 'string', minLength: 1, maxLength: 32 },
                enabled: { type: 'boolean' }
              }
            }
          },
          quietFrom: { type: ['string', 'null'], maxLength: 8 },
          quietTo: { type: ['string', 'null'], maxLength: 8 }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = currentUserId(request);
      if (userId === null) return reply.result.unauth('当前凭证没有用户身份');

      try {
        const { count } = await preferenceService.saveForUser(userId, request.body);
        return reply.result.success('已保存', { count });
      } catch (err) {
        return reply.result.fail(err.message || '保存失败');
      }
    }
  });
}

export default registerPreferenceRoutes;
