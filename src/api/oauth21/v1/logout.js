/**
 * OAuth 2.1 登出端点（OIDC RP-Initiated Logout）
 *
 * GET  /logout — 浏览器重定向登出（RP 用 end_session_endpoint 触发）
 * POST /logout — 前端显式登出（AvatarHoverCard 等调用）
 *
 * 销毁当前会话（Redis session + sid_r 映射 + DB token revoke）并清除 sid/sid_r Cookie。
 * 未登录也可调用（幂等：仅清 Cookie）。
 *
 * TODO: post_logout_redirect_uri 校验（需查客户端注册的 post_logout_redirect_uris 防开放重定向）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { destroySession } from '../../../framework/auth/session.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'logout',
    alias: '登出',
    description: 'OIDC RP-initiated logout',
    enabled: true,
    requireLogin: false
  });

  /**
   * 执行登出：销毁当前会话 + 清 Cookie
   */
  async function doLogout(request, reply) {
    const user = request.state?.user;
    await destroySession({
      sessionId: user?.sessionId,
      userId: user?.userId,
      appId: user?.appId,
      ip: request.ip,
      reply
    });
    return reply.result.success('已登出');
  }

  /**
   * POST /logout — 前端显式登出
   */
  registerSecureRoute(fastify, {
    name: 'logout',
    alias: '登出',
    method: 'POST',
    url: '/logout',
    requireLogin: false,
    handler: doLogout
  });

  /**
   * GET /logout — RP-initiated 登出（浏览器重定向到此）
   *
   * end_session_endpoint 声明于发现文档；post_logout_redirect_uri 暂未校验（见 TODO）。
   */
  registerSecureRoute(fastify, {
    name: 'logoutGet',
    alias: '登出(RP)',
    method: 'GET',
    url: '/logout',
    requireLogin: false,
    handler: doLogout
  });
}
