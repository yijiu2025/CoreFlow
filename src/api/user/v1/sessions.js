/**
 * 用户会话管理 API
 *
 * GET  /user/v1/sessions       — 获取当前用户的活跃会话列表
 * POST /user/v1/sessions/kick  — 踢掉指定会话
 * POST /user/v1/sessions/kick-all — 踢掉所有其他会话
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { checkMaxSessions, kickSession, kickAllSessions } from '../../../auth/session.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'userSessions',
    alias: '会话管理',
    description: '用户设备会话管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /user/v1/sessions
   * 获取当前用户的活跃会话列表
   */
  registerSecureRoute(fastify, {
    name: 'listSessions',
    alias: '获取活跃会话',
    method: 'GET',
    url: '/sessions',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const redis = request.server.redis;
      const result = await checkMaxSessions(redis, user.userId || user.sub, 'GLOBAL', 9999);
      const sessions = result?.sessions || [];

      return reply.result.success('获取成功', {
        sessions: sessions.map(s => ({
          sessionId: s.sessionId?.substring(0, 16) + '...',
          deviceType: s.deviceType || 'browser',
          ip: s.ip,
          lastActive: s.lastActive,
          isCurrent: request.cookies?.sid?.includes(s.sessionId?.substring(0, 16))
        })),
        total: sessions.length,
        maxSessions: result?.maxSessions || 5
      });
    }
  });

  /**
   * POST /user/v1/sessions/kick
   * 踢掉指定会话
   */
  registerSecureRoute(fastify, {
    name: 'kickSession',
    alias: '踢掉指定会话',
    method: 'POST',
    url: '/sessions/kick',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const { sessionId } = request.body;
      if (!sessionId) {
        return reply.code(400).send({ code: 400, message: '缺少 sessionId', data: null });
      }

      const redis = request.server.redis;
      await kickSession(redis, sessionId, user.userId || user.sub);

      return reply.result.success('会话已踢出');
    }
  });

  /**
   * POST /user/v1/sessions/kick-all
   * 踢掉所有其他会话（保留当前会话）
   */
  registerSecureRoute(fastify, {
    name: 'kickAllSessions',
    alias: '踢出所有其他会话',
    method: 'POST',
    url: '/sessions/kick-all',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const redis = request.server.redis;
      await kickAllSessions(redis, user.userId || user.sub);

      return reply.result.success('所有其他会话已踢出');
    }
  });
}
