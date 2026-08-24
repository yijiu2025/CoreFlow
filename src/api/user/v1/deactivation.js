/**
 * 用户注销申请 API（用户自助）
 *
 * POST /user/v1/deactivation/apply   — 提交注销申请（scope=app/all）
 * POST /user/v1/deactivation/revoke   — 撤销注销申请
 * GET  /user/v1/deactivation/pending   — 查自己的待撤销申请
 *
 * 注销流程：申请 → 拒登录(7天撤销期) → 到期管理员执行正式注销
 * 正式执行接口位于 /admin/user/v1/deactivation/execute/:id（管理员）
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import deactivationService from '../../../app/user/services/deactivation.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'userDeactivation',
    alias: '用户注销',
    description: '用户注销申请与撤销',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * POST /user/v1/deactivation/apply
   * 提交注销申请
   * body: { scope: 'app'|'all', app_id?: string, reason?: string }
   */
  registerSecureRoute(fastify, {
    name: 'applyDeactivation',
    alias: '提交注销申请',
    method: 'POST',
    url: '/deactivation/apply',
    requireLogin: true,
    config: {
      // 注销申请敏感，限频防滥用
      rateLimit: { max: 3, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.userId && !user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      // user.state 里 userId 可能是 id，sub 是 uid；统一取 id 和 uid
      const userId = user.userId || user.id;
      const uid = user.sub || user.uid;
      if (!userId || !uid) {
        return reply.result.fail('用户信息不完整', null, 400);
      }

      try {
        const { scope, app_id, reason } = request.body || {};
        const record = await deactivationService.applyDeactivation({ id: userId, uid }, { scope, app_id, reason });
        return reply.result.success('注销申请已提交，7 天内可撤销', {
          id: record.id,
          scope: record.scope,
          app_id: record.app_id,
          scheduled_at: record.scheduled_at,
          status: record.status
        });
      } catch (err) {
        const isBiz = err.message?.startsWith('DEACTIVATION_FAILED');
        return reply.result.fail(err.message || '提交失败', null, isBiz ? 400 : 500);
      }
    }
  });

  /**
   * POST /user/v1/deactivation/revoke
   * 撤销注销申请（body: { deactivationId: number }）
   */
  registerSecureRoute(fastify, {
    name: 'revokeDeactivation',
    alias: '撤销注销申请',
    method: 'POST',
    url: '/deactivation/revoke',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId || user?.id;
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const { deactivationId } = request.body || {};
      if (!deactivationId) {
        return reply.result.fail('缺少 deactivationId', null, 400);
      }

      try {
        const result = await deactivationService.revokeDeactivation(userId, Number(deactivationId));
        return reply.result.success('已撤销注销申请', result);
      } catch (err) {
        const isBiz = err.message?.startsWith('DEACTIVATION_FAILED');
        return reply.result.fail(err.message || '撤销失败', null, isBiz ? 400 : 500);
      }
    }
  });

  /**
   * GET /user/v1/deactivation/pending
   * 查自己的待撤销注销申请
   */
  registerSecureRoute(fastify, {
    name: 'getPendingDeactivation',
    alias: '查询待撤销注销',
    method: 'GET',
    url: '/deactivation/pending',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      const userId = user?.userId || user?.id;
      if (!userId) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const list = await deactivationService.getMyPending(userId);
      return reply.result.success('获取成功', { list });
    }
  });
}
