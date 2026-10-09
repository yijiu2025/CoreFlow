/**
 * RetroWeb 任务 API（S0 骨架）
 *
 * 🔴 现阶段**故意一律 501**：表与模型已就位、鉴权链路可验证，但读写逻辑要等
 *    迁移在目标库上跑完（S1）才接。先让"应用能被加载、权限点能生效、前端还没有
 *    任何行为变化"，避免半实现的接口被前端误用。
 *
 * 501 而不是 404：告诉调用方"这条路是对的，只是还没盖完"，不是"你找错地方了"。
 *
 * @since 2026-10-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { RETROWEB_PERMISSIONS } from '../../../app/retroweb/permission/index.js';

const NOT_READY = '该接口尚未实现（S0 骨架：请先执行 retroweb 迁移，随后在 S1 接入读写）';

async function registerTaskRoutes(fastify) {
  registerGroupMetadata({
    name: 'task',
    description: '任务（一个目标分子 + 整棵路线树）',
    prefix: '/v1'
  });

  // 探活：不碰数据库，用来确认应用已被加载、登录态可用
  registerSecureRoute(fastify, {
    name: 'retrowebPing',
    alias: 'RetroWeb 探活',
    method: 'GET',
    url: '/ping',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    handler: async (request, reply) => {
      return reply.result.success('retroweb 模块已加载', {
        app: 'retroweb',
        stage: 'S0',
        userId: request.state.user?.userId ?? null
      });
    }
  });

  registerSecureRoute(fastify, {
    name: 'listRetrowebTasks',
    alias: '获取任务列表',
    method: 'GET',
    url: '/tasks',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    handler: async (_request, reply) => reply.result.fail(NOT_READY, null, 501)
  });

  registerSecureRoute(fastify, {
    name: 'getRetrowebQuota',
    alias: '查询任务配额',
    method: 'GET',
    url: '/tasks/quota',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.READ,
    handler: async (_request, reply) => reply.result.fail(NOT_READY, null, 501)
  });

  registerSecureRoute(fastify, {
    name: 'createRetrowebTask',
    alias: '新建任务',
    method: 'POST',
    url: '/tasks',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.TASK.CREATE,
    handler: async (_request, reply) => reply.result.fail(NOT_READY, null, 501)
  });
}

export default registerTaskRoutes;
