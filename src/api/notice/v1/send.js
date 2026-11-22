/**
 * 服务间发送接口
 *
 * POST /notice/v1/send  body: { eventCode, userIds, payload }
 *
 * 权限码 `notice:send`，不要求管理角色 —— 调用方通常是其他业务服务。
 * 返回值是**汇总**而不是逐条结果：调用方只需要知道"发出去几条、失败几条"，
 * 逐条原因在管理页的发送记录里查（那里有 target 与 error）。
 *
 * 🔴 本接口永远返回 200 + 汇总（未知事件除外）：投递是副作用，失败不该让
 * 调用方把已经成功的业务回滚。真正的失败落在 notice_delivery_logs。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { NOTICE_PERMISSIONS } from '../../../app/notice/permission/index.js';
import * as deliveryService from '../../../app/notice/services/delivery.service.js';

async function registerSendRoutes(fastify) {
  registerGroupMetadata({
    name: 'noticeSend',
    alias: '通知发送',
    description: '服务间触发通知投递',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'noticeSendMessage',
    alias: '发送通知',
    method: 'POST',
    url: '/send',
    requirePermission: NOTICE_PERMISSIONS.SEND.EXECUTE,
    schema: {
      body: {
        type: 'object',
        required: ['eventCode'],
        properties: {
          eventCode: { type: 'string', minLength: 1, maxLength: 64 },
          userIds: {
            type: 'array',
            maxItems: deliveryService.MAX_RECIPIENTS,
            items: { type: 'integer', minimum: 1 }
          },
          payload: { type: 'object' }
        }
      }
    },
    handler: async (request, reply) => {
      const { eventCode, userIds = [], payload = {} } = request.body;
      const summary = await deliveryService.send({ eventCode, userIds, payload });
      if (summary.error && summary.total === 0) {
        return reply.result.fail(summary.error, summary);
      }
      return reply.result.success('已受理', summary);
    }
  });
}

export default registerSendRoutes;
