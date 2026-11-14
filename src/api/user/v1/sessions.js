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
import {
  checkMaxSessions,
  kickSession,
  kickAllSessions,
  kickDeviceEverywhere,
  clearAuthCookies
} from '../../../framework/security/auth/index.js';
import { formatSessionList, formatDeviceList } from '../../../app/user/services/session-view.service.js';
import { getModel } from '../../../framework/persistence/db/index.js';
import crypto from 'crypto';

async function registerSessionsRoutes(fastify) {
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
   * 踢掉指定会话（需验证目标会话属于当前用户，防越权踢他人）
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

      // 归属验证：目标 session 必须属于当前用户，否则返回 404（不泄露存在性）
      const SessionToken = getModel('SessionToken');
      const tokenHash = crypto.createHash('sha256').update(sessionId).digest('hex');
      const token = await SessionToken.findOne({
        where: { token: tokenHash, user_id: user.userId || user.sub, revoked: false }
      });
      if (!token) {
        return reply.code(404).send({ code: 404, message: '会话不存在', data: null });
      }

      await kickSession(sessionId, user.userId || user.sub);

      return reply.result.success('会话已踢出');
    }
  });

  /**
   * POST /user/v1/sessions/kick-device
   * 踢掉「我的」某一台设备（自助，不需要管理端角色）
   *
   * body: { id } —— **必须是 `GET /sessions/devices` 返回的行 id**，不是设备码。
   * 列表里的 `deviceId` 是打码值（`maskDeviceId`），拿它去和 Redis 里的完整
   * device_id 比对永远不相等，踢出数恒为 0（看起来像"权限不够"，其实是值不对）。
   * 服务端用 id + user_id 双条件取回完整设备码，顺带完成归属校验（越权查不到行）。
   *
   * 踢的是「当前这台」时同时清登录 Cookie 并回 `current: true`：会话已经没了，
   * 不清 Cookie 的话前端下一次请求才 401，中间会停在一个"点了没反应"的页面。
   */
  registerSecureRoute(fastify, {
    name: 'kickMyDevice',
    alias: '踢掉我的某台设备',
    method: 'POST',
    url: '/sessions/kick-device',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const id = Number(request.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ code: 400, message: '缺少设备行 id', data: null });
      }

      const userId = Number(user.userId || user.sub);
      const SessionToken = getModel('SessionToken');
      const row = await SessionToken.findOne({
        where: { id, user_id: userId },
        attributes: ['id', 'app_id', 'device_id']
      });
      // 归属不符与不存在返回同一个 404：不让调用方用 id 探测别人的设备行
      if (!row) {
        return reply.code(404).send({ code: 404, message: '设备不存在', data: null });
      }
      if (!row.device_id) {
        return reply.result.fail('该设备没有设备码，无法精确踢出（可改用「退出其他所有设备」）');
      }

      // Redis 会话 + DB 令牌 + 孤儿 refresh token 三步一起做（理由见 kickDeviceEverywhere）
      const { kicked, revoked, clearedRefresh } = await kickDeviceEverywhere(userId, row.app_id, row.device_id);
      // 目标设备 = 发起请求的这台设备（session 里带出的 deviceId 即当前设备）
      const current = Boolean(user.deviceId) && user.deviceId === row.device_id;
      if (current) clearAuthCookies(reply);

      // 会话可能早已过期：这时 kicked=0 不代表操作失败，DB 令牌同样被撤销了
      const message = current
        ? '当前设备已下线'
        : kicked > 0
          ? `已踢出 ${kicked} 个会话`
          : revoked > 0
            ? `该设备已无活跃会话，已撤销 ${revoked} 条历史令牌`
            : '该设备没有需要下线的会话';

      return reply.result.success(message, { kicked, revoked, clearedRefresh, current });
    }
  });

  /**
   * POST /user/v1/sessions/prune-revoked
   * 清理「我的」已下线设备记录（只删 `revoked = true` 的行）
   *
   * 为什么可以删：这些行是会话的 DB 兜底记录，revoked 之后 Redis 侧会话已清，
   * 记录只剩"历史列表"一个用途。设备页堆几十条灰行时，真正在线的那几台反而找不到。
   *
   * 安全边界：
   * - `where` 强制带 `user_id`（取会话里的 userId，**不接受前端传**），只能清自己的；
   * - 只删 revoked 行，在线会话（revoked = 0）一条都不动；
   * - 审计不在这里：登录/踢出流水在 `session_logs`，删这些行不会丢审计。
   */
  registerSecureRoute(fastify, {
    name: 'pruneMyRevokedDevices',
    alias: '清理我的已下线设备记录',
    method: 'POST',
    url: '/sessions/prune-revoked',
    requireLogin: true,
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ code: 401, message: '未登录', data: null });
      }

      const userId = Number(user.userId || user.sub);
      const SessionToken = getModel('SessionToken');
      const removed = await SessionToken.destroy({ where: { user_id: userId, revoked: true } });

      return reply.result.success(removed > 0 ? `已清理 ${removed} 条已下线记录` : '没有需要清理的记录', { removed });
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

      // 保留当前会话：没有这个参数就是"把自己也踢了"，用户会以为功能坏了
      const kicked = await kickAllSessions(user.userId || user.sub, user.sessionId || null);

      return reply.result.success(`已踢出 ${kicked} 个其他会话`, { kicked });
    }
  });
}

export default registerSessionsRoutes;
