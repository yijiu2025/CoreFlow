/**
 * 用户注销管理接口（管理端）
 *
 * 落 /admin/user/v1/deactivation/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['admin']。
 *
 * GET  /admin/user/v1/deactivation/list          — 注销申请列表（分页，可按 status/scope/userId 筛选）
 * POST /admin/user/v1/deactivation/execute/:id   — 正式执行注销（到期或 force 强制）
 * POST /admin/user/v1/deactivation/cancel/:id    — 管理员撤销注销申请
 * GET  /admin/user/v1/deactivation/executable     — 查已到期可执行的申请（定时任务/手动批量）
 *
 * 正式执行逻辑：
 *   scope=app → 清该 app 的 OAuth 授权(approval/consent/token) + 吊销该 app session
 *   scope=all → 清所有 app 的上述数据 + 软删 user_user + 踢所有 session
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import deactivationService from '../../../../app/user/services/deactivation.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'userDeactivationAdmin',
    alias: '用户注销管理',
    description: '注销申请查看与正式执行（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * GET /admin/user/v1/deactivation/list
   * 注销申请列表（分页）
   * query: { status?, scope?, userId?, page=1, pageSize=20 }
   */
  registerSecureRoute(fastify, {
    name: 'listDeactivation',
    alias: '注销申请列表',
    method: 'GET',
    url: '/deactivation/list',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { status, scope, userId, page = 1, pageSize = 20 } = request.query;
      const result = await deactivationService.listForAdmin({
        status,
        scope,
        userId: userId ? Number(userId) : undefined,
        page: Number(page),
        pageSize: Number(pageSize)
      });
      return reply.result.success('获取成功', result);
    }
  });

  /**
   * POST /admin/user/v1/deactivation/execute/:id
   * 正式执行注销
   * body: { force?: boolean }  force=true 可在到期前强制执行
   */
  registerSecureRoute(fastify, {
    name: 'executeDeactivation',
    alias: '执行注销',
    method: 'POST',
    url: '/deactivation/execute/:id',
    requireLogin: true,
    allowRoles: ['admin'],
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { force = false } = request.body || {};
      const adminUser = request.state?.user;

      try {
        const result = await deactivationService.executeDeactivation(Number(id), {
          adminUserId: adminUser?.userId || adminUser?.id,
          force: !!force
        });
        return reply.result.success('注销已执行', result);
      } catch (err) {
        const isBiz = err.message?.startsWith('DEACTIVATION_FAILED');
        return reply.result.fail(err.message || '执行失败', null, isBiz ? 400 : 500);
      }
    }
  });

  /**
   * POST /admin/user/v1/deactivation/cancel/:id
   * 管理员撤销注销申请（区别于用户自助撤销，此处由管理员操作）
   */
  registerSecureRoute(fastify, {
    name: 'cancelDeactivation',
    alias: '撤销注销申请',
    method: 'POST',
    url: '/deactivation/cancel/:id',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { id } = request.params;
      const adminUser = request.state?.user;
      const adminUserId = adminUser?.userId || adminUser?.id || 0;

      // 直接用 dao 撤销（service.revokeDeactivation 校验 userId 归属，管理员不适用）
      const { default: deactivationDao } = await import('../../../../app/user/dao/deactivation.js');
      try {
        const affected = await deactivationDao.revoke(Number(id), adminUserId);
        if (!affected) {
          return reply.result.fail('撤销失败：申请不存在或已处理', null, 400);
        }
        return reply.result.success('已撤销注销申请', { id: Number(id) });
      } catch (err) {
        const isBiz = err.message?.startsWith('DEACTIVATION_FAILED');
        return reply.result.fail(err.message || '撤销失败', null, isBiz ? 400 : 500);
      }
    }
  });

  /**
   * GET /admin/user/v1/deactivation/executable
   * 查已到期可执行的申请（定时任务批量执行用）
   * query: { limit=100 }
   */
  registerSecureRoute(fastify, {
    name: 'listExecutableDeactivation',
    alias: '可执行注销列表',
    method: 'GET',
    url: '/deactivation/executable',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { limit = 100 } = request.query;
      const { default: deactivationDao } = await import('../../../../app/user/dao/deactivation.js');
      const list = await deactivationDao.findExecutable(Number(limit));
      return reply.result.success('获取成功', { list, total: list.length });
    }
  });
}
