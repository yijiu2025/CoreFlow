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
 * - LONG_SESSION_TTL: 1个月/30天（勾选"记住我"，sid cookie maxAge）
 * - REFRESH_TOKEN_TTL: 半年/180天（sid_r cookie maxAge，remember 凭证有效期）
 *
 * @author Claude
 * @since 2026-07-13
 */
import crypto from 'node:crypto';

/** sid_r 刷新端点路径（sid_r cookie 的 path，只在该端点携带） */
const REFRESH_COOKIE_PATH = '/auth/v1/refresh-session';

/** 短期登录: sid cookie maxAge (秒) */
const SHORT_SESSION_TTL = 1800; // 30分钟

/** 长期登录: sid cookie maxAge (秒) — 1 个月（30 天） */
const LONG_SESSION_TTL = 2592000; // 30天

/**
 * sid_r cookie maxAge (秒) — 30 天
 * sid 过期时用 sid_r 自动续期；sid_r 自身滑动 30 天（每次刷新重置）
 */
const REFRESH_TOKEN_TTL = 2592000; // 30天

/**
 * 登录凭证 cookie maxAge (秒) — 半年（180 天）
 * 记住我账号的长期凭证（user_<uid> cookie + refreshToken 映射 TTL）。
 * sid_r 失效后凭此恢复；半年不使用或被踢下线即失效，需重新登录。
 */
const USER_COOKIE_TTL = 15552000; // 180天

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

// ── 多账号免切凭证 cookie（HttpOnly，cookie 名 = HMAC(uid)）──
//
// 每账号一个 HttpOnly cookie 存其 refreshToken，cookie 名 = HMAC-SHA256(uid, SECRET)
// 前 16 hex（形如 k_<hex>，不可逆，非明文 uid）。该 HMAC 值同时作为：
//   1) cookie 名（后端按 accountKey 直接读 request.cookies[accountKey] 取 rt）
//   2) 前端 localStorage 的 key（同 uid → 同 HMAC → 自动去重，不会因重复登录产生多条）
//   3) 切账号时前端发送的 accountKey（后端无需解密，直接当 cookie 名读 rt）
// JS 读不到 rt（HttpOnly），localStorage 只存 accountKey + name/avatar（防 XSS 窃凭证）。
// 无明文 uid 暴露：HMAC 不可逆，换 SECRET 则所有 accountKey 失效（强制重新登录）。

/**
 * 由 uid 生成账号 key（HMAC-SHA256(uid, SECRET) 前 16 hex）
 * 用途：凭证 cookie 名 + 前端 localStorage key + 切账号发送值，三者统一。
 * 确定性：同 uid 永远相同（自动去重）；不可逆（非明文）；随 SECRET 变化。
 * @param {string} uid 用户 uid
 * @returns {string} 形如 k_<16hex>
 */
function accountKeyForUid(uid) {
  return `k_${crypto.createHmac('sha256', SECRET).update(String(uid)).digest('hex').slice(0, 16)}`;
}

/** 凭证 cookie 选项（HttpOnly，JS 不可读；半年有效期，使用即续期） */
const USER_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: USER_COOKIE_TTL,
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
};

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
  COOKIE_SID_R,
  USER_COOKIE_OPTS,
  USER_COOKIE_TTL,
  accountKeyForUid
};
