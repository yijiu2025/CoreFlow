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
// 前 16 hex（形如 k_<hex>，不可逆，非明文 uid）。accountKey 与 cookie 名分离：
//   - accountKey = uid 明文（前端 localStorage key + 切账号发送值，身份标识非凭证）
//   - cookie 名  = HMAC(uid)（HttpOnly，JS 不可读；后端用 accountKey 派生，无需解密）
// 同 uid → 同 HMAC → 同 cookie 名（确定性，自动去重）。
// JS 读不到 rt（HttpOnly）；localStorage 只存 accountKey(=uid) + name/avatar，即使泄露也非凭证。
// 无明文 uid 暴露风险：uid 本就是公开标识（= JWT sub），非凭证；换 SECRET 则 cookie 名全变
// → 旧凭证 cookie 读不到 → 强制重新登录（换 SECRET 前可主动清旧 cookie，否则旧 cookie 残留至过期）。

/**
 * 由 uid 生成凭证 cookie 名（HMAC-SHA256(uid, SECRET) 前 16 hex，带 k_ 前缀）
 * 用途：HttpOnly 凭证 cookie 的名字（后端用 accountKey=uid 派生，读 request.cookies[cookieName] 取 rt）。
 * 注意：此值不返回前端，前端 accountKey 直接用 uid 明文；二者分离。
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
  // path 收窄到 switch-account 端点：k_<HMAC(uid)> 凭证 cookie 只在切换账号时携带，
  // 不随业务请求发送（减少凭证暴露面；其他端点不读此 cookie）
  path: '/auth/v1/switch-account',
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
  },
  // device_id：稳定设备标识 cookie，供风险检测 getDeviceId 读取基准。
  // 跨域 iframe 场景：oauth21 登录域写的 cookie posecraft 域带不过去，
  // 故 bind-session 时在 posecraft 域也写一份（用登录时生成的稳定值）。
  // HttpOnly（JS 不可读防泄露）+ 10 年长期 + lax + path='/' 全域可读。
  DEVICE: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 365 * 24 * 60 * 60
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
