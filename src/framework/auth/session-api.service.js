/**
 * Session API 编排服务
 *
 * 从 api/auth/v1/session.js 下沉：Token↔Cookie 互转、Cookie 生命周期管理。
 * 复用 framework/auth 的 createSession/refreshSession/updateRememberMe/switchSessionByRefreshToken + cookie 工具。
 * 路由层只调本服务 + reply。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { verify } from '../jwt/index.js';
import { createSession, updateRememberMe, switchSessionByRefreshToken, revokeRememberMe } from './session.js';
import { getStore } from '../redis/index.js';
import {
  signCookie,
  COOKIE_OPTIONS,
  COOKIE_SID_R,
  USER_COOKIE_OPTS,
  accountKeyForUid,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL
} from './cookie.js';

/** access_token Cookie 配置（JWT 模式，HttpOnly + sameSite lax） */
const ACCESS_TOKEN_COOKIE_OPTS = maxAge => ({
  httpOnly: true,
  maxAge,
  path: '/',
  sameSite: 'lax'
});

// ── accounts cookie 已废弃：明文 uid 暴露风险，改用 accountKey（HMAC(uid)）──
// 账号列表不再下发 cookie，前端从 localStorage（key=accountKey）渲染切换界面。

/**
 * 绑定 Bearer Token 为 HttpOnly access_token Cookie（JWT 模式）
 *
 * @param {string} authHeader - Authorization 头（Bearer <token>）
 * @param {object} reply - Fastify reply
 * @returns {Promise<{ok:true, expiresAt:number} | {ok:false, statusCode:number, error:object}>}
 */
export async function bindTokenToCookie(authHeader, reply) {
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      statusCode: 400,
      error: { error: 'invalid_request', error_description: '缺少 Authorization Bearer Token' }
    };
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verify(token);
    if (!payload?.sub) {
      return { ok: false, statusCode: 401, error: { error: 'invalid_token', error_description: 'Token 无效' } };
    }

    // Cookie 过期时间与 JWT exp 对齐（至少 1 分钟）
    const now = Math.floor(Date.now() / 1000);
    const maxAge = Math.max((payload.exp - now) * 1000, 60 * 1000);

    reply.setCookie('access_token', token, ACCESS_TOKEN_COOKIE_OPTS(maxAge));
    return { ok: true, expiresAt: payload.exp };
  } catch {
    return { ok: false, statusCode: 401, error: { error: 'invalid_token', error_description: 'Token 已过期或无效' } };
  }
}

/**
 * 用临时 session_token 换取 sid/sid_r Cookie（Session 模式，iframe SSO 场景）
 *
 * @param {string} sessionToken - 临时 session_token
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @returns {Promise<{ok:true, user:object} | {ok:false, statusCode:number, body:object}>}
 *   失败含 statusCode=400(缺参)/401(无效)/409(并发超限)；409 时 body 含 sessions 供前端引导踢设备
 */
export async function bindSessionToCookie(sessionToken, request, reply) {
  if (!sessionToken) {
    return { ok: false, statusCode: 400, body: { code: 400, message: '缺少 session_token', data: null } };
  }

  // 从 Redis 读取临时 session 数据
  const sessionStore = getStore('session_token');
  const sessionData = await sessionStore.get(sessionToken);
  if (!sessionData) {
    return { ok: false, statusCode: 401, body: { code: 401, message: 'session_token 无效或已过期', data: null } };
  }

  // 删除临时 token（一次性使用）
  await sessionStore.delete(sessionToken);

  // 创建正式 Session，refreshToken 写入 accountKey HttpOnly cookie（JS 读不到，防 XSS）
  let accountKey = null;
  try {
    const sess = await createSession({
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
    // sid/sid_r cookie 由 createSession 下发；refreshToken 写入混淆名 HttpOnly cookie
    // （cookie 名 = accountKeyForUid(uid) = HMAC(uid)，JS 不可读）
    if (sess?.refreshToken && sessionData.uid) {
      accountKey = accountKeyForUid(sessionData.uid);
      reply.setCookie(accountKey, sess.refreshToken, USER_COOKIE_OPTS);
    }
  } catch (err) {
    // 并发会话超限：结构化 409，供前端引导用户踢掉旧设备
    if (err.code === 'MAX_SESSIONS_EXCEEDED') {
      return {
        ok: false,
        statusCode: 409,
        body: {
          code: 409,
          message: '设备数量已达上限',
          data: { action: 'max_sessions', maxSessions: err.maxSessions, sessions: err.sessions }
        }
      };
    }
    throw err;
  }

  return {
    ok: true,
    user: {
      id: sessionData.userId,
      uid: sessionData.uid,
      username: sessionData.username,
      name: sessionData.username,
      email: sessionData.email,
      avatar: sessionData.avatar
    },
    // accountKey = HMAC(uid)，前端存 localStorage 作多账号 key（不存 refreshToken，rt 在 HttpOnly cookie）
    accountKey
  };
}

/**
 * 清除所有认证 Cookie（access_token + sid + sid_r）
 * @param {object} reply - Fastify reply
 */
export function clearAuthCookies(reply) {
  reply.clearCookie('access_token', { path: '/' });
  reply.clearCookie('sid', { ...COOKIE_OPTIONS.SID });
  // sid_r 的 path 收窄到刷新端点，clear 时 path 必须一致才能清掉
  reply.clearCookie('sid_r', { ...COOKIE_OPTIONS.SID_R });
}

/**
 * 动态切换当前会话的"记住我"状态，同步更新 Cookie
 *
 * @param {number} userId - 用户内部 ID
 * @param {string} sessionId - 当前会话 ID
 * @param {number} [accessCount=0] - 当前 accessCount（sid 重新签名用）
 * @param {boolean} rememberMe - 是否长期登录
 * @param {object} reply - Fastify reply
 * @returns {Promise<{ok:true, rememberMe:boolean} | {ok:false, statusCode:number, body:object}>}
 */
export async function updateRememberMeCookies(userId, sessionId, accessCount, rememberMe, reply) {
  if (!sessionId) {
    return { ok: false, statusCode: 401, body: { code: 401, message: '未登录' } };
  }

  // 1. 切换 Redis 侧状态：session TTL + refresh token 增删（family 由 session.js 管理）
  let result;
  try {
    result = await updateRememberMe(userId, sessionId, !!rememberMe);
  } catch (err) {
    if (err.message === 'SESSION_NOT_FOUND') {
      return { ok: false, statusCode: 401, body: { code: 401, message: '会话已失效，请重新登录' } };
    }
    throw err;
  }

  // 2. 更新客户端 cookie
  const ttl = rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
  reply.setCookie('sid', signCookie(sessionId, accessCount || 0), {
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

  return { ok: true, rememberMe: !!rememberMe };
}

/**
 * 用 accountKey 免密切换账号（HttpOnly user cookie 模型）
 *
 * 前端 localStorage 存 {[accountKey]: {name, avatar}}（accountKey = HMAC(uid)，不存 rt）。
 * 切换时前端发 accountKey，后端直接以其作 cookie 名读 HttpOnly cookie 的 refreshToken
 * → refreshSessionCore 验证轮转 → 下发新 sid/sid_r + 更新该 cookie 的 rt。
 *
 * refreshToken 全程在 HttpOnly cookie（JS 读不到），防 XSS 窃凭证。
 * accountKey 是 HMAC(uid)，不可逆（非明文 uid），无需后端解密。
 *
 * @param {object} request - Fastify request（读 cookie / ip / user-agent）
 * @param {object} reply - Fastify reply（设 sid/sid_r + 更新 user cookie）
 * @param {string} accountKey - 前端 localStorage 的目标账号 key（HMAC(uid)，形如 k_<16hex>）
 * @returns {Promise<{action:'switched', user:object} | {action:'need_password'}>}
 */
export async function switchAccount(request, reply, accountKey) {
  if (!accountKey) return { action: 'need_password' };

  // accountKey 即凭证 cookie 名，直接读取（无需 AES 解密）
  const cookieName = accountKey;
  const refreshToken = request?.cookies?.[cookieName];
  if (!refreshToken) {
    // 该账号无凭证 cookie（非记住我 / 已登出撤销 / cookie 过期）→ 走密码登录
    return { action: 'need_password' };
  }

  // 用 refreshToken 走刷新轮转（复用 refreshSessionCore：验证 + 轮转新 sid/sid_r）
  const result = await switchSessionByRefreshToken(refreshToken, request, reply);
  if (!result) {
    // 目标账号 refreshToken 失效（已轮转/被吊销/用户禁用）→ 清目标 user cookie
    // （当前账号 sid/sid_r 仍有效，未切换，不清；前端删 localStorage 目标项 + 走密码登录）
    reply.clearCookie(cookieName, USER_COOKIE_OPTS);
    return { action: 'need_password' };
  }

  // 轮转后旧 refreshToken 已标 rotated 失效，更新该 user cookie 为新 refreshToken
  reply.setCookie(cookieName, result.refreshToken, USER_COOKIE_OPTS);

  return { action: 'switched', user: result.user };
}

/**
 * 彻底撤销某账号的记住我凭证（"忘掉该账号"用）
 *
 * 前端发 accountKey，后端直接以其作 cookie 名读 rt cookie → revokeRememberMe
 * + 清该 user cookie。下次该账号需重新输密码登录。
 *
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @param {string} accountKey - 前端 localStorage 的目标账号 key（HMAC(uid)）
 */
export async function removeSavedAccount(request, reply, accountKey) {
  if (!accountKey) return;
  const cookieName = accountKey;
  const refreshToken = request?.cookies?.[cookieName];
  if (refreshToken) {
    await revokeRememberMe(refreshToken);
  }
  reply.clearCookie(cookieName, USER_COOKIE_OPTS);
  // 清 sid_r cookie（若当前浏览器持有的正是该账号的 sid_r）
  reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });
}
