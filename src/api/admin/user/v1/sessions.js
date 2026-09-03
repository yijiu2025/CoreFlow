/**
 * 用户会话管理接口（管理端）
 *
 * 落 /admin/user/v1/sessions/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['admin']。
 *
 * GET  /admin/user/v1/sessions/list          — 某用户的所有设备会话（供"设备管理"页展示）
 * POST /admin/user/v1/sessions/kick-by-device — 按 device_id 精准踢单设备会话
 *
 * 设计：踢出逻辑复用 session.kickByDeviceId（公共 _kickSession：删 Redis session +
 * 失效 sid_r + DB 标记 revoked + 清 user_sessions 索引 + 写 SessionLog），保证踢出路径
 * 与 kickByDeviceType / kickUser 一致。
 *
 * 限制：kickByDeviceId 依赖 Redis user_sessions 逆索引遍历，按 sd.deviceId 精确匹配。
 * 若 Redis 降级或 session 已失效，该设备无活跃 Redis session 可踢，仅返回 kicked=0；
 * DB session_tokens 行历史记录不在此清理（由定期清理任务处理，见问题清单 §3-5）。
 *
 * @author yijiu2025
 * @since 2026-09-03
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { getModel } from '../../../../framework/db/index.js';
import { kickByDeviceId } from '../../../../framework/auth/session.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'userSessionsAdmin',
    alias: '用户会话管理',
    description: '查看用户设备会话与远程踢单设备（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * GET /admin/user/v1/sessions/list
   * 某用户的所有设备会话列表
   * query: { userId, appId?, revoked? }
   *
   * 返回每个设备的：device_id、device_fingerprint、app_id、ip、user_agent、last_active、revoked。
   * 同 user_id+device_id 设备幂等（session_tokens upsert），故列表是去重后的设备视图。
   */
  registerSecureRoute(fastify, {
    name: 'listUserSessions',
    alias: '用户设备会话列表',
    method: 'GET',
    url: '/sessions/list',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { userId, appId, revoked } = request.query;
      if (!userId) {
        return reply.result.fail('userId 不能为空');
      }

      const SessionToken = getModel('SessionToken');
      if (!SessionToken) {
        return reply.result.fail('SessionToken 模型未加载');
      }

      const where = { user_id: Number(userId) };
      if (appId) where.app_id = appId;
      if (revoked !== undefined) where.revoked = revoked === 'true' || revoked === true;

      const rows = await SessionToken.findAll({
        where,
        order: [['last_active', 'DESC']],
        attributes: [
          'id',
          'user_id',
          'app_id',
          'device_id',
          'device_fingerprint',
          'ip',
          'user_agent',
          'last_active',
          'revoked',
          'updated_at'
        ]
      });

      return reply.result.success('获取成功', rows);
    }
  });

  /**
   * POST /admin/user/v1/sessions/kick-by-device
   * 按 device_id 精准踢单设备会话（远程踢下线）
   * body: { userId, appId, deviceId }
   *
   * 只踢 user_id+app_id+device_id 指定的那台设备的活跃 Redis session，
   * 不影响该用户其他设备。返回实际踢出的会话数（0=该设备当前无活跃 session）。
   */
  registerSecureRoute(fastify, {
    name: 'kickSessionByDevice',
    alias: '踢单设备',
    method: 'POST',
    url: '/sessions/kick-by-device',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { userId, appId, deviceId } = request.body || {};

      if (!userId || !appId || !deviceId) {
        return reply.result.fail('userId / appId / deviceId 不能为空');
      }

      const kicked = await kickByDeviceId(Number(userId), appId, deviceId);
      return reply.result.success(`已踢出 ${kicked} 个会话`, { kicked });
    }
  });
}
