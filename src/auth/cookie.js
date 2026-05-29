/**
 * Cookie 签名与验证工具
 * 使用 HMAC-SHA256 对 Session ID 签名，防篡改
 */
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'change-me-session-secret';

/**
 * 对 sessionId 签名，返回完整的 cookie 值
 * @param {string} sessionId 会话 ID
 * @returns {string} 格式: sessionId.hmacSignature
 */
export function signCookie(sessionId) {
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(sessionId)
    .digest('hex');
  return `${sessionId}.${signature}`;
}

/**
 * 验证 cookie 值，返回 sessionId 或 null
 * @param {string} cookieValue cookie 值 (格式: sessionId.signature)
 * @returns {string|null} 验证通过返回 sessionId，失败返回 null
 */
export function verifyCookie(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;

  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex <= 0) return null;

  const sessionId = cookieValue.substring(0, dotIndex);
  const signature = cookieValue.substring(dotIndex + 1);

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(sessionId)
    .digest('hex');

  // 常量时间比较，防止时序攻击
  if (signature.length !== expected.length) return null;
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    )
  ) {
    return null;
  }

  return sessionId;
}

/**
 * Cookie 配置常量
 */
export const COOKIE_OPTIONS = {
  SID: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  },
  SID_R: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  }
};

/** 短期登录: sid cookie maxAge (秒) */
export const SHORT_SESSION_TTL = 7200; // 2小时

/** 长期登录: sid cookie maxAge (秒) */
export const LONG_SESSION_TTL = 1800; // 30分钟

/** 长期登录: sid_r cookie maxAge (秒) */
export const REFRESH_TOKEN_TTL = 2592000; // 30天

/** Cookie 名称 */
export const COOKIE_SID = 'sid';
export const COOKIE_SID_R = 'sid_r';
