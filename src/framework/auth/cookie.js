/**
 * Cookie 签名与验证工具
 *
 * 使用 HMAC-SHA256 对 Session ID 签名，防止客户端篡改 Cookie 内容。
 * 每次请求验证时递增 accessCount 并重新签名，实现 Cookie 的轮转更新。
 *
 * Cookie 格式: payload.signature
 * - payload: base64url(sessionId:accessCount) — 内部编码，外部不可读
 * - signature: HMAC-SHA256(payload, SESSION_SECRET)
 *
 * 配置常量：
 * - COOKIE_SID: 短期/长期会话 Cookie 名称（默认 "sid"）
 * - COOKIE_SID_R: 长期登录刷新令牌 Cookie 名称（默认 "sid_r"）
 * - SHORT_SESSION_TTL: 30分钟（不勾选"记住我"）
 * - LONG_SESSION_TTL: 30天（勾选"记住我"）
 * - REFRESH_TOKEN_TTL: 30天（sid_r 有效期）
 *
 * @author Claude
 * @since 2026-07-13
 */
import crypto from 'node:crypto';

/** sid_r 刷新端点路径（sid_r cookie 的 path，只在该端点携带） */
const REFRESH_COOKIE_PATH = '/auth/v1/refresh-session';

/** 短期登录: sid cookie maxAge (秒) */
const SHORT_SESSION_TTL = 1800; // 30分钟

/** 长期登录: sid cookie maxAge (秒) */
const LONG_SESSION_TTL = 2592000; // 30天

/** 长期登录: sid_r cookie maxAge (秒) */
const REFRESH_TOKEN_TTL = 2592000; // 30天

/** 旧 sid_r 轮转后保留"已轮转"标记的时长（秒），用于复用盗用检测；默认 7 天 */
const ROTATED_RETENTION = parseInt(process.env.ROTATED_RETENTION) || 604800;

/** Cookie 名称 */
const COOKIE_SID = 'sid';
const COOKIE_SID_R = 'sid_r';

// 生产环境必须显式配置 SESSION_SECRET，否则 HMAC 签名可被伪造 sid，直接拒绝启动
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET 未配置：生产环境必须设置该环境变量（随机长字符串）');
  }
  console.warn('⚠️ [Auth] SESSION_SECRET 未配置，开发环境使用默认值，生产必须配置');
}
const SECRET = process.env.SESSION_SECRET || 'change-me-session-secret';

/**
 * 对 sessionId 签名，返回完整的 cookie 值
 * @param {string} sessionId 会话 ID
 * @param {number} [accessCount=0] 访问次数
 * @returns {string} 格式: payload.signature
 */
function signCookie(sessionId, accessCount = 0) {
  const payload = Buffer.from(`${sessionId}:${accessCount}`).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

/**
 * 验证 cookie 值，返回解析结果或 null
 * @param {string} cookieValue cookie 值 (格式: payload.signature)
 * @returns {{ sessionId: string, accessCount: number } | null}
 */
function verifyCookie(cookieValue) {
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
const COOKIE_OPTIONS = {
  SID: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  },
  // sid_r 仅在刷新端点携带：path 收窄到 /auth/v1/refresh-session + sameSite=strict，
  // 避免长期 refresh token 在每个业务请求暴露（与 JWT 模式 refresh_token 一致）
  SID_R: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH
  }
};

export {
  signCookie,
  verifyCookie,
  COOKIE_OPTIONS,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL,
  REFRESH_COOKIE_PATH,
  ROTATED_RETENTION,
  COOKIE_SID,
  COOKIE_SID_R
};
