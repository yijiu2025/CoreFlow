/**
 * 设备-账号注册表（抖音式多账号免密切换）
 *
 * 单 sid cookie 模型下，一个浏览器同时只持有一个活跃 sid。"免密切换账号" =
 * 服务端把 sid cookie 重新指向目标账号的 session——前提是本机此前登录过该账号
 * 且其 session 仍在 Redis 存活。
 *
 * 安全边界：以服务端下发的 `device_id` cookie（HttpOnly、跨子域）作为"本机"凭据，
 * 而非 UA 指纹（UA 可被同浏览器版本用户共享 → 可伪造）。注册表以 device_id 为键，
 * 只有本机浏览器持有 → 别人仅凭 uid 无法触发免切。
 *
 * 两类 cookie：
 * - `device_id`（HttpOnly）：本机凭据，注册表键。
 * - `accounts`（非 HttpOnly、跨子域、JSON）：仅登录页展示账号 chips，不是凭据——
 *   伪造它不能触发未授权切换（切换以注册表为准）。与 tracknick/user_avatar 同信任级。
 *
 * 注册表（Redis / MapStore）：`device_accounts:<deviceId>` → JSON
 *   { accounts: { [uid]: {uid, username, avatar, appId, sessionId, refreshToken, rememberMe, mode, lastLoginAt} } }
 *
 * @author yijiu2025
 * @since 2026-08-16
 */

import crypto from 'node:crypto';
import { getStore } from '../redis/index.js';
import { LONG_SESSION_TTL } from './cookie.js';

/** cookie 名 */
const DEVICE_COOKIE = 'device_id';
const ACCOUNTS_COOKIE = 'accounts';

/** 展示账号上限（cookie 体积控制） */
const ACCOUNTS_MAX = 8;

/** device_id cookie 有效期（秒）—— 本机凭据，长期 */
const DEVICE_TTL = 365 * 86400;

/** accounts 展示 cookie 有效期（秒） */
const ACCOUNTS_TTL = 30 * 86400;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
/** 跨子域 cookie domain（生产设为 .your.com；空=host-only） */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '';

/** device_id cookie 选项（HttpOnly，本机凭据不暴露给 JS） */
const DEVICE_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'lax',
  path: '/',
  maxAge: DEVICE_TTL,
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
};

/** accounts cookie 选项（非 HttpOnly，前端登录页直读展示） */
const ACCOUNTS_COOKIE_OPTS = {
  httpOnly: false,
  secure: IS_PRODUCTION,
  sameSite: 'lax',
  path: '/',
  maxAge: ACCOUNTS_TTL,
  ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
};

const deviceStore = getStore('device_accounts');
const sessionStore = getStore('session');

/**
 * 生成随机 device_id
 * @returns {string} 32 位 hex
 */
function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 确保请求携带 device_id cookie，无则生成并下发
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {string} device_id
 */
export function ensureDeviceCookie(request, reply) {
  const existing = request?.cookies?.[DEVICE_COOKIE];
  if (existing) return existing;
  const id = generateDeviceId();
  reply.setCookie(DEVICE_COOKIE, id, DEVICE_COOKIE_OPTS);
  return id;
}

/**
 * 读取整张注册表
 * @param {string} deviceId
 * @returns {Promise<{accounts: object}>}
 */
async function readRegistry(deviceId) {
  const raw = await deviceStore.get(deviceId);
  return raw?.accounts ? raw : { accounts: {} };
}

/**
 * 写整张注册表（刷新 TTL）
 * @param {string} deviceId
 * @param {{accounts: object}} data
 */
async function writeRegistry(deviceId, data) {
  await deviceStore.set(deviceId, data, LONG_SESSION_TTL);
}

/**
 * 记录一次登录：把账号写入注册表 + 刷新 accounts 展示 cookie
 * @param {string} deviceId
 * @param {import('fastify').FastifyReply} reply
 * @param {object} acct - {uid, username, avatar, appId, sessionId, refreshToken, rememberMe, mode}
 */
export async function recordAccount(deviceId, reply, acct) {
  const data = await readRegistry(deviceId);
  data.accounts[acct.uid] = {
    userId: acct.userId || null,
    uid: acct.uid,
    username: acct.username,
    avatar: acct.avatar,
    appId: acct.appId,
    sessionId: acct.sessionId,
    refreshToken: acct.refreshToken || null,
    rememberMe: !!acct.rememberMe,
    mode: acct.mode || 'session',
    lastLoginAt: Math.floor(Date.now() / 1000)
  };
  await writeRegistry(deviceId, data);
  setAccountsCookie(reply, data);
}

/**
 * 取目标账号注册表项（不判 session 存活，由调用方检查）
 * @param {string} deviceId
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
export async function getAccountEntry(deviceId, uid) {
  const data = await readRegistry(deviceId);
  return data.accounts[uid] || null;
}

/**
 * 判目标账号 session 是否存活（命中 Redis session 即活）
 * @param {object} entry - 注册表项
 * @returns {Promise<object|null>} 存活则返回 sessionData，否则 null
 */
export async function getLiveSession(entry) {
  if (!entry?.sessionId) return null;
  return sessionStore.get(entry.sessionId);
}

/**
 * 删除某账号注册表项 + 刷新 accounts cookie
 * @param {string} deviceId
 * @param {import('fastify').FastifyReply} reply
 * @param {string} uid
 */
export async function removeAccount(deviceId, reply, uid) {
  const data = await readRegistry(deviceId);
  if (data.accounts[uid]) {
    delete data.accounts[uid];
    await writeRegistry(deviceId, data);
  }
  setAccountsCookie(reply, data);
}

/**
 * 列出本机所有账号（按最近登录倒序，cap ACCOUNTS_MAX）
 * 顺带 prune 已失效 session 的注册表项，保持展示新鲜
 * @param {string} deviceId
 * @returns {Promise<Array<{uid, username, avatar}>>}
 */
export async function listAccounts(deviceId) {
  const data = await readRegistry(deviceId);
  // prune：移除 session 已失效的项
  let changed = false;
  const kept = {};
  for (const [uid, acct] of Object.entries(data.accounts)) {
    const live = await sessionStore.get(acct.sessionId);
    if (live) kept[uid] = acct;
    else changed = true;
  }
  if (changed) await writeRegistry(deviceId, { accounts: kept });
  return Object.values(kept)
    .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0))
    .slice(0, ACCOUNTS_MAX)
    .map(a => ({ uid: a.uid, username: a.username, avatar: a.avatar }));
}

/**
 * 由注册表生成 accounts 展示 cookie 值并下发
 * @param {import('fastify').FastifyReply} reply
 * @param {{accounts: object}} data
 */
function setAccountsCookie(reply, data) {
  const list = Object.values(data.accounts || {})
    .sort((a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0))
    .slice(0, ACCOUNTS_MAX)
    .map(a => ({ uid: a.uid, name: a.username, avatar: a.avatar }));
  reply.setCookie(ACCOUNTS_COOKIE, encodeURIComponent(JSON.stringify(list)), ACCOUNTS_COOKIE_OPTS);
}

export { DEVICE_COOKIE, ACCOUNTS_COOKIE };
