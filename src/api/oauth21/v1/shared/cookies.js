/**
 * Cookie 设置工具函数
 * 统一管理所有认证相关 Cookie 的设置逻辑
 */

import config from '../../../../app/oauth21/config/config.js';
import { issueH5Token } from '../../../../auth/signature.js';
import { IS_PRODUCTION } from './constants.js';

/**
 * 设置认证 Cookie（access_token + refresh_token + 辅助 Cookie）
 * @param {object} reply - Fastify reply 对象
 * @param {object} params
 * @param {string} params.accessToken - JWT access token
 * @param {string} params.refreshToken - refresh token
 * @param {object} params.user - 用户信息 { id, username, name, email, avatar }
 * @param {object} fastify - Fastify 实例（用于 H5 token）
 */
export async function setAuthCookies(reply, { accessToken, refreshToken, user }, fastify) {
  // Access Token Cookie
  reply.setCookie('access_token', accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    maxAge: config.jwt.accessTokenTTL * 1000,
    path: '/',
    sameSite: 'lax'
  });

  // Refresh Token Cookie（仅用于 token 端点）
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    maxAge: config.jwt.refreshTokenTTL * 1000,
    path: '/oauth2.1/token',
    sameSite: 'strict'
  });

  // 辅助 Cookie（非 HttpOnly，前端可读取用于显示）
  reply.setCookie('tracknick', encodeURIComponent(user.name || user.username), {
    path: '/',
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: config.jwt.accessTokenTTL * 1000
  });

  reply.setCookie('user_avatar', encodeURIComponent(user.avatar || ''), {
    path: '/',
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: config.jwt.accessTokenTTL * 1000
  });

  // H5 签名 Token
  if (fastify) {
    await issueH5Token(fastify, reply);
  }
}

/**
 * 清除所有认证 Cookie
 * @param {object} reply - Fastify reply 对象
 */
export function clearAuthCookies(reply) {
  reply.clearCookie('access_token', { path: '/' });
  reply.clearCookie('refresh_token', { path: '/oauth2.1/token' });
  reply.clearCookie('tracknick', { path: '/' });
  reply.clearCookie('user_avatar', { path: '/' });
  reply.clearCookie('user_id', { path: '/' });
}

/**
 * 构建标准令牌响应
 * @param {object} result - issueDirectTokens 返回结果
 * @param {string} message - 成功消息
 * @returns {object} 标准响应体
 */
export function buildTokenResponse(result, message = '登录成功') {
  return {
    code: 200,
    message,
    data: {
      accessToken: result.access_token,
      accessTokenExpiredTime: String(config.jwt.accessTokenTTL * 1000),
      refreshToken: result.refresh_token,
      tokenType: 'Bearer',
      expiresIn: config.jwt.accessTokenTTL,
      scope: result.scope,
      user: result.user
    }
  };
}
