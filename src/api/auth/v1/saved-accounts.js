/**
 * 已登录账号管理路由（抖音式免密切换，前端 localStorage 多凭证模型）
 *
 * POST   /auth/v1/switch-account — 用 refreshToken 免密切换账号（轮转新 sid/sid_r + 返回新 refreshToken）
 * POST   /auth/v1/saved-accounts/revoke — 彻底撤销某账号记住我凭证
 *
 * 凭据为前端 localStorage 存储的 refreshToken（登录时 bind-session 响应返回），
 * 不再用 device_id cookie + 服务端注册表。切换/移除时前端把 refreshToken 发来验证。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { switchAccount, removeSavedAccount } from '../../../framework/auth/session-api.service.js';
import { isAllowedOrigin } from '../../../framework/auth/origin-guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'saved-accounts',
    alias: '已登录账号',
    description: '多账号免密切换与凭证撤销',
    prefix: '/v1',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /auth/v1/switch-account
   *
   * body: { accountKey }（前端 localStorage 的账号 key，= uid 明文）
   * 返回：
   * - 成功：{ code:200, data: { action:'switched', user } }
   * - 需密码：{ code:200, data: { action:'need_password' } }（凭证失效，前端删 localStorage + 走密码登录）
   *
   * 来源校验：与 bind-session 同属"凭证→会话"转换端点，安全级别保持一致。
   * switch-account 依赖 HttpOnly 凭证 cookie（cookie 名 = HMAC(uid)，JS 不可读）里的 refreshToken，
   * 跨域 CSRF 请求会自动带 cookie，故用 origin-guard 白名单限制仅授权前端域可调用。
   */
  registerSecureRoute(fastify, {
    name: 'switchAccount',
    alias: '切换账号',
    method: 'POST',
    url: '/switch-account',
    requireLogin: false,
    handler: async (request, reply) => {
      if (!isAllowedOrigin(request)) {
        return reply.code(403).send({ code: 403, message: '来源不在允许列表', data: null });
      }
      const { accountKey } = request.body || {};
      if (!accountKey) {
        return reply.code(400).send({ code: 400, message: '缺少 accountKey', data: null });
      }

      const result = await switchAccount(request, reply, accountKey);
      if (result.action === 'switched') {
        return reply.result.success('切换成功', { user: result.user });
      }
      // need_password：凭证失效，前端删 localStorage + 走密码登录
      return reply.send({
        code: 200,
        message: '凭证已失效，请重新登录',
        data: result
      });
    }
  });

  /**
   * POST /auth/v1/saved-accounts/revoke — 彻底撤销某账号记住我凭证
   * body: { accountKey }（= uid 明文）
   *
   * 来源校验：与 switch-account 同属凭证操作端点，安全级别保持一致。
   */
  registerSecureRoute(fastify, {
    name: 'revokeSavedAccount',
    alias: '撤销已登录账号凭证',
    method: 'POST',
    url: '/saved-accounts/revoke',
    requireLogin: false,
    handler: async (request, reply) => {
      if (!isAllowedOrigin(request)) {
        return reply.code(403).send({ code: 403, message: '来源不在允许列表', data: null });
      }
      const { accountKey } = request.body || {};
      if (!accountKey) {
        return reply.code(400).send({ code: 400, message: '缺少 accountKey', data: null });
      }
      await removeSavedAccount(request, reply, accountKey);
      return reply.result.success('已撤销');
    }
  });
}
