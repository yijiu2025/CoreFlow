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
import { verify } from '../../../framework/jwt/index.js';
import { createSession, refreshSession, updateRememberMe } from '../../../framework/auth/session.js';
import { getStore } from '../../../framework/redis/index.js';
import {
  signCookie,
  COOKIE_OPTIONS,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL
} from '../../../framework/auth/cookie.js';

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
        const payload = await verify(token);
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
      } catch {
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
      const { session_token } = request.body;
      if (!session_token) {
        return reply.code(400).send({
          code: 400,
          message: '缺少 session_token',
          data: null
        });
      }

      // 从 Redis 读取临时 session 数据
      const sessionStore = getStore('session_token');
      const sessionData = await sessionStore.get(session_token);
      if (!sessionData) {
        return reply.code(401).send({
          code: 401,
          message: 'session_token 无效或已过期',
          data: null
        });
      }

      // 删除临时 token（一次性使用）
      await sessionStore.delete(session_token);

      // 创建正式 Session，设置 sid/sid_r Cookie
      try {
        await createSession({
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
        });
      } catch (err) {
        // 并发会话超限：返回结构化 409，便于前端引导用户踢掉旧设备（不再抛 500）
        if (err.code === 'MAX_SESSIONS_EXCEEDED') {
          return reply.code(409).send({
            code: 409,
            message: '设备数量已达上限',
            data: {
              action: 'max_sessions',
              maxSessions: err.maxSessions,
              sessions: err.sessions
            }
          });
        }
        throw err;
      }

      return reply.result.success('Session 已绑定', {
        user: {
          id: sessionData.userId,
          username: sessionData.username,
          name: sessionData.username,
          email: sessionData.email,
          avatar: sessionData.avatar
        }
      });
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
      reply.clearCookie('sid', { ...COOKIE_OPTIONS.SID });
      // sid_r 的 path 收窄到刷新端点，clear 时 path 必须一致才能清掉
      reply.clearCookie('sid_r', { ...COOKIE_OPTIONS.SID_R });
      return reply.result.success('Cookie 已清除');
    }
  });

  /**
   * POST /auth/v1/update-remember-me
   *
   * 动态更新当前会话的 "记住我/保存登录信息" 状态
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
      if (!user?.sessionId) {
        return reply.code(401).send({ code: 401, message: '未登录' });
      }

      // 1. 切换 Redis 侧状态：session TTL + refresh token 增删（family 由 session.js 管理）
      //    抛 SESSION_NOT_FOUND 表示会话已失效，需重新登录
      let result;
      try {
        result = await updateRememberMe(user.userId, user.sessionId, !!rememberMe);
      } catch (err) {
        if (err.message === 'SESSION_NOT_FOUND') {
          return reply.code(401).send({ code: 401, message: '会话已失效，请重新登录' });
        }
        throw err;
      }

      // 2. 更新客户端 cookie
      const ttl = rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
      reply.setCookie('sid', signCookie(user.sessionId, user.accessCount || 0), {
        ...COOKIE_OPTIONS.SID,
        maxAge: ttl
      });

      if (rememberMe && result.refreshToken) {
        // 开启：下发 sid_r（path=刷新端点，maxAge 单位为秒，与 createSession 一致）
        reply.setCookie('sid_r', signCookie(result.refreshToken, 0), {
          ...COOKIE_OPTIONS.SID_R,
          maxAge: REFRESH_TOKEN_TTL
        });
      } else {
        // 关闭：清掉 sid_r（path 必须与设置时一致）
        reply.clearCookie('sid_r', { ...COOKIE_OPTIONS.SID_R });
      }

      return reply.result.success('保存登录状态更新成功', { rememberMe: !!rememberMe });
    }
  });

  /**
   * POST /auth/v1/refresh-session
   *
   * 用 sid_r cookie 刷新 sid session。
   * 前端收到 401 时调用此接口，后端验证 sid_r 后签发新 sid。
   *
   * 流程：
   * 1. 前端请求 API 返回 401（sid 过期）
   * 2. 前端调用 POST /auth/v1/refresh-session（携带 sid_r cookie）
   * 3. 后端验证 sid_r → 签新 sid → 设置新 sid cookie
   * 4. 前端收到 200 后重试原请求
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
