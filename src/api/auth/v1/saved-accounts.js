/**
 * 已登录账号管理路由（抖音式免密切换）
 *
 * POST   /auth/v1/switch-account      — 切换到本机已登录的某账号（免密 / 回退密码）
 * DELETE /auth/v1/saved-accounts/:uid — 从本机账号清单移除某账号
 *
 * 业务逻辑见 framework/auth/session-api.service.js（switchAccount / removeSavedAccount）。
 * 凭据为 device_id cookie（见 device-accounts.js），非 UA 指纹。
 * 展示账号清单由 accounts cookie 提供，前端直读，无需 GET 端点。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { switchAccount, removeSavedAccount } from '../../../framework/auth/session-api.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'saved-accounts',
    alias: '已登录账号',
    description: '本机已登录账号免密切换与清单管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /auth/v1/switch-account
   *
   * body: { uid }
   * 返回（HTTP 200，按 action 分发，与 consent 流一致便于前端复用）：
   * - 成功：{ action:'switched', user, session_token }（session_token 供 iframe SSO 父窗口 bind-session）
   * - 需密码：{ action:'need_password', uid, username?, avatar? }
   */
  registerSecureRoute(fastify, {
    name: 'switchAccount',
    alias: '切换账号',
    method: 'POST',
    url: '/switch-account',
    requireLogin: false,
    handler: async (request, reply) => {
      const { uid } = request.body || {};
      if (!uid) {
        return reply.code(400).send({ code: 400, message: '缺少 uid', data: null });
      }

      const result = await switchAccount(request, reply, uid);
      if (result.action === 'switched') {
        return reply.result.success('切换成功', {
          user: result.user,
          session_token: result.session_token
        });
      }
      // need_password：带预填用户名/头像
      return reply.send({
        code: 200,
        message: result.username ? '会话已过期，请重新输入密码' : '请输入密码登录',
        data: result
      });
    }
  });

  /**
   * DELETE /auth/v1/saved-accounts/:uid — 从本机账号清单移除某账号
   */
  registerSecureRoute(fastify, {
    name: 'removeSavedAccount',
    alias: '移除已登录账号',
    method: 'DELETE',
    url: '/saved-accounts/:uid',
    requireLogin: false,
    handler: async (request, reply) => {
      const { uid } = request.params;
      await removeSavedAccount(request, reply, uid);
      return reply.result.success('已移除');
    }
  });
}
