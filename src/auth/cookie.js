/**
 * Cookie 签名与验证工具
 * 使用 HMAC-SHA256 对 Session ID 签名，防篡改
 *
 * Cookie 格式: payload.signature
 * - payload: base64(sessionId:accessCount) — 内部编码，外部不可读
 * - signature: HMAC-SHA256(payload, SECRET)
 */
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'change-me-session-secret';

/**
 * 对 sessionId 签名，返回完整的 cookie 值
 * @param {string} sessionId 会话 ID
 * @param {number} [accessCount=0] 访问次数
 * @returns {string} 格式: payload.signature
 */
export function signCookie(sessionId, accessCount = 0) {
  const payload = Buffer.from(`${sessionId}:${accessCount}`).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

/**
 * 验证 cookie 值，返回解析结果或 null
 * @param {string} cookieValue cookie 值 (格式: payload.signature)
 * @returns {{ sessionId: string, accessCount: number } | null}
 */
export function verifyCookie(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;

  // 按 '.' 分割为 2 段: payload, signature
  const dotIndex = cookieValue.indexOf('.');
  if (dotIndex <= 0) return null;

  const payload = cookieValue.substring(0, dotIndex);
  const signature = cookieValue.substring(dotIndex + 1);

  if (!payload || !signature) return null;

  // 验证签名
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return null;
  }

  // 解码 payload
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex <= 0) return null;

    const sessionId = decoded.substring(0, colonIndex);
    const accessCount = parseInt(decoded.substring(colonIndex + 1), 10);

    if (!sessionId || isNaN(accessCount)) return null;
    return { sessionId, accessCount };
  } catch {
    return null;
  }
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
