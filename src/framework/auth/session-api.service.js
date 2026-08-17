/**
 * Session API 编排服务
 *
 * 从 api/auth/v1/session.js 下沉：Token↔Cookie 互转、Cookie 生命周期管理。
 * 复用 framework/auth 的 createSession/refreshSession/updateRememberMe + cookie/device-accounts 工具。
 * 路由层只调本服务 + reply。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { verify } from '../jwt/index.js';
import { createSession, updateRememberMe, switchSessionByRefreshToken, revokeRememberMe } from './session.js';
import { ensureDeviceCookie, getAccountEntry, removeAccount, recordAccount } from './device-accounts.js';
import { getStore } from '../redis/index.js';
import {
  signCookie,
  COOKIE_OPTIONS,
  COOKIE_SID_R,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL
} from './cookie.js';
import { generateToken } from '../../app/oauth21/crypto/tokens.js';

/** access_token Cookie 配置（JWT 模式，HttpOnly + sameSite lax） */
const ACCESS_TOKEN_COOKIE_OPTS = maxAge => ({
  httpOnly: true,
  maxAge,
  path: '/',
  sameSite: 'lax'
});

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

  // 创建正式 Session + 记录到本机账号清单
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

    const deviceId = ensureDeviceCookie(request, reply);
    await recordAccount(deviceId, reply, {
      uid: sessionData.uid || String(sessionData.userId),
      userId: sessionData.userId,
      username: sessionData.username,
      avatar: sessionData.avatar,
      appId: sessionData.appId,
      sessionId: sess?.sessionId,
      refreshToken: sess?.refreshToken,
      rememberMe: sessionData.rememberMe,
      mode: 'session'
    });
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
      username: sessionData.username,
      name: sessionData.username,
      email: sessionData.email,
      avatar: sessionData.avatar
    }
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
 * 免密切换到本机已登录的某账号（抖音式）
 *
 * 仅"记住我"账号可免切：用注册表存的 refreshToken 走 refreshSessionCore 验证+轮转，
 * 下发新 sid/sid_r。非记住我（无 refreshToken）→ 回退密码登录（带用户名/头像预填）。
 *
 * 轮转后旧 refreshToken 失效，必须用返回的新值更新注册表，否则下次切换触发盗用检测。
 *
 * 流程：
 * 1. 注册表无此账号 → 需密码登录
 * 2. 非记住我 / 无 refreshToken → 需密码（预填用户名/头像）
 * 3. refreshToken 验证失败（已轮转/被吊销/用户禁用）→ 移除账号 + 需密码
 * 4. 验证成功 → 下发新 sid/sid_r + 更新注册表（新 sessionId/refreshToken）+ 生成 session_token 供 iframe SSO
 *
 * @param {object} request - Fastify request（取 device_id cookie / ip / user-agent）
 * @param {object} reply - Fastify reply（设 cookie）
 * @param {string} uid - 目标账号 uid
 * @returns {Promise<{action:'switched', user:object, session_token:string} | {action:'need_password', uid:string, username?:string, avatar?:string}>}
 */
export async function switchAccount(request, reply, uid) {
  const deviceId = ensureDeviceCookie(request, reply);
  const entry = await getAccountEntry(deviceId, uid);
  if (!entry) {
    return { action: 'need_password', uid };
  }

  // 非记住我 / 无 refreshToken → 不能免密，回退密码（带预填）
  if (!entry.rememberMe || !entry.refreshToken) {
    return { action: 'need_password', uid, username: entry.username, avatar: entry.avatar };
  }

  // 用 refreshToken 走刷新轮转（复用 refreshSessionCore：验证 + 轮转新 sid/sid_r）
  const result = await switchSessionByRefreshToken(entry.refreshToken, request, reply);
  if (!result) {
    // refreshToken 失效（revoked/过期/被盗用/用户禁用）→ 移除账号 + 回退密码
    await removeAccount(deviceId, reply, uid);
    return { action: 'need_password', uid, username: entry.username, avatar: entry.avatar };
  }

  // 轮转后旧 refreshToken 已标 rotated 失效，更新注册表为新 sessionId/refreshToken
  // （否则下次切换用旧 refreshToken 会触发盗用检测吊销整个 family）
  await recordAccount(deviceId, reply, {
    uid,
    userId: result.user.id,
    username: entry.username,
    avatar: entry.avatar,
    appId: entry.appId,
    sessionId: result.sessionId,
    refreshToken: result.refreshToken,
    rememberMe: true,
    mode: 'session'
  });

  // 生成 session_token 供 iframe SSO 父窗口 /auth/v1/bind-session 换取 sid（跨子域场景）
  const sessionToken = generateToken(32);
  const sessionTokenStore = getStore('session_token');
  await sessionTokenStore.set(
    sessionToken,
    {
      userId: result.user.id,
      uid: result.user.uid,
      username: result.user.username,
      email: result.user.email,
      avatar: result.user.avatar,
      status: 1,
      appId: entry.appId,
      ip: request.ip,
      deviceId: entry.deviceId,
      deviceType: 'browser',
      userAgent: request.headers['user-agent'] || '',
      rememberMe: true
    },
    300
  );

  return { action: 'switched', user: result.user, session_token: sessionToken };
}

/**
 * 彻底忘记某账号（"移除账号"用，与"退出登录"的软退出相反）
 *
 * 撤销记住我凭证（refreshToken 映射 + family + DB token + session）+ 清 sid_r cookie +
 * 删注册表项。下次该账号需重新输密码登录（无法免密回来）。
 *
 * @param {object} request - Fastify request（取 device_id cookie）
 * @param {object} reply - Fastify reply
 * @param {string} uid - 目标账号 uid
 */
export async function removeSavedAccount(request, reply, uid) {
  const deviceId = ensureDeviceCookie(request, reply);
  const entry = await getAccountEntry(deviceId, uid);
  if (entry) {
    // 彻底撤销记住我凭证（refreshToken 映射 + DB token + session + family）
    await revokeRememberMe(entry.userId, entry.sessionId, entry.refreshToken);
  }
  await removeAccount(deviceId, reply, uid); // 删注册表项 + 刷 accounts cookie
  // 清 sid_r cookie（path 必须与设置时一致；若当前浏览器持有的是别的账号的 sid_r，清也无害）
  reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });
}
