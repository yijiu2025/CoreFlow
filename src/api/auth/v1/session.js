/**
 * Auth 会话管理
 *
 * POST /auth/v1/bind-token    — 将 Bearer Token 绑定为 HttpOnly Cookie（JWT 模式）
 * POST /auth/v1/bind-session  — 用临时 token 换取 sid/sid_r Cookie（Session 模式）
 * POST /auth/v1/clear-cookie  — 清除认证 Cookie
 *
 * 职责：Token ↔ Cookie 互转，Cookie 生命周期管理
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { verify } from '../../../app/oauth21/crypto/jwt.js';
import { createSession } from '../../../auth/session.js';
import { getSessionStore } from '../../../redis/session-store.js';

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
   * POST /auth/v1/bind-token
   *
   * 将 Bearer Token 绑定为 HttpOnly Cookie。
   * 前端登录获取 token 后调用此接口，后续请求自动携带 Cookie。
   *
   * 流程：
   * 1. 前端 SSO 登录获取 JWT token
   * 2. 调用 POST /auth/v1/bind-token（Authorization: Bearer <token>）
   * 3. 后端验证 token 有效性
   * 4. 后端设置 access_token HttpOnly Cookie
   * 5. 后续请求浏览器自动携带 Cookie，前端无需手动注入 Header
   */
  registerSecureRoute(fastify, {
    name: 'bindToken',
    alias: '绑定 Token 到 Cookie',
    method: 'POST',
    url: '/bind-token',
    handler: async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(400).send({
          error: 'invalid_request',
          error_description: '缺少 Authorization Bearer Token'
        });
      }

      const token = authHeader.slice(7);
      try {
        const payload = verify(token);
        if (!payload?.sub) {
          return reply.code(401).send({
            error: 'invalid_token',
            error_description: 'Token 无效'
          });
        }

        // 计算 Cookie 过期时间（与 JWT exp 对齐）
        const now = Math.floor(Date.now() / 1000);
        const maxAge = Math.max((payload.exp - now) * 1000, 60 * 1000); // 至少 1 分钟

        // 设置 HttpOnly Cookie
        reply.setCookie('access_token', token, {
          httpOnly: true,
          maxAge,
          path: '/',
          sameSite: 'lax'
        });

        return reply.result.success('Cookie 已绑定', {
          expiresAt: payload.exp
        });
      } catch (err) {
        return reply.code(401).send({
          error: 'invalid_token',
          error_description: 'Token 已过期或无效'
        });
      }
    }
  });

  /**
   * POST /auth/v1/bind-session
   *
   * 用临时 session_token 换取 sid/sid_r Cookie。
   * 用于 iframe 登录场景：SSO iframe 登录成功后返回 session_token，
   * 主页面调用此接口将 session 绑定到当前域的 Cookie。
   *
   * 流程：
   * 1. SSO iframe 登录 → 后端生成 session_token 存入 Redis
   * 2. iframe 通过 postMessage 将 session_token 传给主页面
   * 3. 主页面调用 POST /auth/v1/bind-session { session_token }
   * 4. 后端从 Redis 读取 session 数据，创建正式 Session
   * 5. 设置 sid/sid_r HttpOnly Cookie 到当前域
   */
  registerSecureRoute(fastify, {
    name: 'bindSession',
    alias: '绑定 Session 到 Cookie',
    method: 'POST',
    url: '/bind-session',
    handler: async (request, reply) => {
      const { session_token } = request.body
      if (!session_token) {
        return reply.code(400).send({
          code: 400,
          message: '缺少 session_token',
          data: null
        })
      }

      // 从 Redis 读取临时 session 数据
      const sessionStore = getSessionStore(fastify, 'session_token')
      const sessionData = await sessionStore.get(session_token)
      if (!sessionData) {
        return reply.code(401).send({
          code: 401,
          message: 'session_token 无效或已过期',
          data: null
        })
      }

      // 删除临时 token（一次性使用）
      await sessionStore.delete(session_token)

      // 创建正式 Session，设置 sid/sid_r Cookie
      const redis = request.server.redis
      await createSession({
        redis,
        userId: sessionData.userId,
        uid: sessionData.uid,
        username: sessionData.username,
        email: sessionData.email,
        avatar: sessionData.avatar,
        status: sessionData.status,
        appId: sessionData.appId,
        ip: request.ip,
        deviceId: sessionData.deviceId,
        deviceType: sessionData.deviceType,
        userAgent: request.headers['user-agent'] || '',
        rememberMe: sessionData.rememberMe,
        reply
      })

      return reply.result.success('Session 已绑定', {
        user: {
          id: sessionData.userId,
          username: sessionData.username,
          name: sessionData.username,
          email: sessionData.email,
          avatar: sessionData.avatar
        }
      })
    }
  });

  /**
   * POST /auth/v1/clear-cookie
   *
   * 清除认证相关 Cookie（退出登录时调用）
   */
  registerSecureRoute(fastify, {
    name: 'clearCookie',
    alias: '清除认证 Cookie',
    method: 'POST',
    url: '/clear-cookie',
    handler: async (request, reply) => {
      reply.clearCookie('access_token', { path: '/' });
      reply.clearCookie('sid', { path: '/' });
      reply.clearCookie('sid_r', { path: '/' });
      return reply.result.success('Cookie 已清除');
    }
  });
}
