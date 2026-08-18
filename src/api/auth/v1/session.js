/**
 * Auth 会话管理路由
 *
 * POST /auth/v1/bind-token         — 将 Bearer Token 绑定为 HttpOnly Cookie（JWT 模式）
 * POST /auth/v1/bind-session       — 用临时 token 换取 sid/sid_r Cookie（Session 模式）
 * POST /auth/v1/clear-cookie       — 清除认证 Cookie
 * POST /auth/v1/update-remember-me — 动态更新记住我状态
 * POST /auth/v1/refresh-session    — 用 sid_r 刷新 sid
 *
 * 业务逻辑见 framework/auth/session-api.service.js（复用 createSession/updateRememberMe/cookie 工具）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { refreshSession } from '../../../framework/auth/session.js';
import {
  bindTokenToCookie,
  bindSessionToCookie,
  clearAuthCookies,
  updateRememberMeCookies
} from '../../../framework/auth/session-api.service.js';
import { isAllowedOrigin } from '../../../framework/auth/origin-guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'session',
    alias: '会话管理',
    description: 'Token 与 Cookie 互转，会话生命周期管理',
    prefix: '/v1',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /auth/v1/bind-token — 将 Bearer Token 绑定为 HttpOnly Cookie
   *
   * 来源校验：与 bind-session 同属"凭证→cookie"转换端点，安全级别保持一致。
   */
  registerSecureRoute(fastify, {
    name: 'bindToken',
    alias: '绑定 Token 到 Cookie',
    method: 'POST',
    url: '/bind-token',
    handler: async (request, reply) => {
      if (!isAllowedOrigin(request)) {
        return reply.code(403).send({ code: 403, message: '来源不在允许列表', data: null });
      }
      const result = await bindTokenToCookie(request.headers.authorization, reply);
      if (!result.ok) {
        return reply.code(result.statusCode).send(result.error);
      }
      return reply.result.success('Cookie 已绑定', { expiresAt: result.expiresAt });
    }
  });

  /**
   * POST /auth/v1/bind-session — 用临时 session_token 换取 sid/sid_r Cookie
   *
   * 来源校验：session_token 是"持票即认"的一次性凭证，若泄露到非授权域可被消费。
   * 此处用 origin-guard 白名单（复用 CORS_ORIGINS）限制仅父应用域可调用，纵深防御。
   */
  registerSecureRoute(fastify, {
    name: 'bindSession',
    alias: '绑定 Session 到 Cookie',
    method: 'POST',
    url: '/bind-session',
    handler: async (request, reply) => {
      if (!isAllowedOrigin(request)) {
        return reply.code(403).send({ code: 403, message: '来源不在允许列表', data: null });
      }
      const { session_token } = request.body;
      const result = await bindSessionToCookie(session_token, request, reply);
      if (!result.ok) {
        return reply.code(result.statusCode).send(result.body);
      }
      return reply.result.success('Session 已绑定', {
        user: result.user,
        // encUid = AES(uid)，前端存 localStorage 作多账号 key（refreshToken 在 HttpOnly cookie）
        encUid: result.encUid || null
      });
    }
  });

  /**
   * POST /auth/v1/clear-cookie — 清除认证相关 Cookie（退出登录时调用）
   */
  registerSecureRoute(fastify, {
    name: 'clearCookie',
    alias: '清除认证 Cookie',
    method: 'POST',
    url: '/clear-cookie',
    handler: async (request, reply) => {
      clearAuthCookies(reply);
      return reply.result.success('Cookie 已清除');
    }
  });

  /**
   * POST /auth/v1/update-remember-me — 动态更新当前会话的"记住我"状态
   */
  registerSecureRoute(fastify, {
    name: 'updateRememberMe',
    alias: '更新记住我状态',
    method: 'POST',
    url: '/update-remember-me',
    requireLogin: true,
    handler: async (request, reply) => {
      const { rememberMe } = request.body || {};
      const user = request.state.user;
      const result = await updateRememberMeCookies(user.userId, user.sessionId, user.accessCount, rememberMe, reply);
      if (!result.ok) {
        return reply.code(result.statusCode).send(result.body);
      }
      return reply.result.success('保存登录状态更新成功', { rememberMe: result.rememberMe });
    }
  });

  /**
   * POST /auth/v1/refresh-session — 用 sid_r cookie 刷新 sid session
   */
  registerSecureRoute(fastify, {
    name: 'refreshSession',
    alias: '刷新会话',
    method: 'POST',
    url: '/refresh-session',
    requireLogin: false,
    handler: async (request, reply) => {
      const sessionData = await refreshSession({ cookies: request.cookies, reply, request });
      if (!sessionData) {
        return reply.result.unauth('刷新失败，请重新登录');
      }
      return reply.result.success('会话已刷新', { userId: sessionData.userId });
    }
  });
}
