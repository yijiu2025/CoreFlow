/**
 * 用户会话管理 API
 *
 * GET  /user/v1/sessions       — 获取当前用户的活跃会话列表
 * POST /user/v1/sessions/kick  — 踢掉指定会话
 * POST /user/v1/sessions/kick-all — 踢掉所有其他会话
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { checkMaxSessions, kickSession, kickAllSessions } from '../../../framework/auth/session.js';
import { formatSessionList, formatDeviceList } from '../../../app/user/services/session-view.service.js';
import { getModel } from '../../../framework/db/index.js';
import crypto from 'crypto';

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

      const result = await checkMaxSessions(user.userId || user.sub, 'GLOBAL', 9999);
      const view = formatSessionList(result?.sessions || [], request.cookies?.sid);

      return reply.result.success('获取成功', {
        sessions: view.sessions,
        total: view.total,
        maxSessions: result?.maxSessions || 5
      });
    }
  });

  /**
   * GET /user/v1/sessions/devices
   * 获取当前用户登录过的设备列表（DB session_tokens 维度，含历史已 revoked）
   *
   * device_id 中间打码（保平台前缀 + 随机后缀，便于辨认不暴露完整指纹）。
   * 标记 isCurrent：当前请求的 session（按 token=sha256(sid) 匹配）。
   */
  registerSecureRoute(fastify, {
    name: 'listDevices',
    alias: '登录设备列表',
    method: 'GET',
    url: '/sessions/devices',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const SessionToken = getModel('SessionToken');
      if (!SessionToken) {
        return reply.result.fail('SessionToken 模型未加载');
      }

      const rows = await SessionToken.findAll({
        where: { user_id: user.userId || user.sub },
        order: [['last_active', 'DESC']],
        attributes: ['id', 'app_id', 'device_id', 'token', 'ip', 'user_agent', 'last_active', 'revoked']
      });

      // 当前会话 token 哈希（request.state.user.sessionId 由 auth 插件写入）
      const currentSessionId = user.sessionId;
      const currentTokenHash = currentSessionId
        ? crypto.createHash('sha256').update(currentSessionId).digest('hex')
        : null;

      const view = formatDeviceList(rows, currentTokenHash);

      return reply.result.success('获取成功', view);
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

      await kickSession(sessionId, user.userId || user.sub);

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

      await kickAllSessions(user.userId || user.sub);

      return reply.result.success('所有其他会话已踢出');
    }
  });
}
