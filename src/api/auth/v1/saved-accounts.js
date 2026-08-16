/**
 * 已登录账号管理（抖音式免密切换）
 *
 * POST   /auth/v1/switch-account      — 切换到本机已登录的某账号（免密 / 回退密码）
 * DELETE /auth/v1/saved-accounts/:uid  — 从本机账号清单移除某账号
 *
 * 凭据为 device_id cookie（见 device-accounts.js），非 UA 指纹。
 * 展示账号清单由 accounts cookie 提供，前端直读，无需 GET 端点。
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import {
  ensureDeviceCookie,
  getAccountEntry,
  getLiveSession,
  removeAccount
} from '../../../framework/auth/device-accounts.js';
import {
  signCookie,
  COOKIE_OPTIONS,
  COOKIE_SID,
  COOKIE_SID_R,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL
} from '../../../framework/auth/cookie.js';
import { generateToken } from '../../../app/oauth21/crypto/tokens.js';
import { getStore } from '../../../framework/redis/index.js';

const sessionTokenStore = getStore('session_token');

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
   * - 成功：{ user, session_token }（session_token 供 iframe SSO 父窗口 bind-session）
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

      const deviceId = ensureDeviceCookie(request, reply);
      const entry = await getAccountEntry(deviceId, uid);
      if (!entry) {
        // 注册表无此账号 → 需密码登录（无可预填信息）
        return reply.send({
          code: 200,
          message: '请输入密码登录',
          data: { action: 'need_password', uid }
        });
      }

      const sd = await getLiveSession(entry);
      if (!sd) {
        // session 已失效：从清单移除并回退密码（带存储的用户名/头像预填）
        await removeAccount(deviceId, reply, uid);
        return reply.send({
          code: 200,
          message: '会话已过期，请重新输入密码',
          data: { action: 'need_password', uid, username: entry.username, avatar: entry.avatar }
        });
      }

      // 免密切换：重发 sid 指向目标 session（+ sid_r 若长期登录）
      const ttl = entry.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
      reply.setCookie(COOKIE_SID, signCookie(entry.sessionId, 0), {
        ...COOKIE_OPTIONS.SID,
        maxAge: ttl
      });
      if (entry.rememberMe && entry.refreshToken) {
        reply.setCookie(COOKIE_SID_R, signCookie(entry.refreshToken, 0), {
          ...COOKIE_OPTIONS.SID_R,
          maxAge: REFRESH_TOKEN_TTL
        });
      }

      // 生成 session_token 供 iframe SSO 父窗口 /auth/v1/bind-session 换取 sid
      const sessionToken = generateToken(32);
      await sessionTokenStore.set(
        sessionToken,
        {
          userId: sd.userId,
          uid: sd.uid,
          username: sd.username,
          email: sd.email,
          avatar: sd.avatar,
          status: sd.status,
          appId: sd.appId,
          ip: request.ip,
          deviceId: sd.deviceId,
          deviceType: sd.deviceType,
          userAgent: request.headers['user-agent'] || '',
          rememberMe: !!entry.rememberMe
        },
        300
      );

      return reply.result.success('切换成功', {
        user: {
          id: sd.userId,
          uid: sd.uid,
          username: sd.username,
          name: sd.username,
          email: sd.email,
          avatar: sd.avatar
        },
        session_token: sessionToken
      });
    }
  });

  /**
   * DELETE /auth/v1/saved-accounts/:uid
   *
   * 从本机账号清单移除某账号（注册表 + accounts cookie 同步删除）
   */
  registerSecureRoute(fastify, {
    name: 'removeSavedAccount',
    alias: '移除已登录账号',
    method: 'DELETE',
    url: '/saved-accounts/:uid',
    requireLogin: false,
    handler: async (request, reply) => {
      const { uid } = request.params;
      const deviceId = ensureDeviceCookie(request, reply);
      await removeAccount(deviceId, reply, uid);
      return reply.result.success('已移除');
    }
  });
}
