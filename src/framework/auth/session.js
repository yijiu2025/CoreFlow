/**
 * Session 管理器
 * 负责会话的创建、验证、销毁、续期和自动刷新
 * 所有 Redis 操作统一通过 getStore 管理（自带超时、序列化、降级）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import crypto from 'node:crypto';
import { Op } from 'sequelize';
import sequelize from '../db/index.js';
import { getModel } from '../db/index.js';
import { getStore } from '../redis/index.js';
import {
  signCookie,
  verifyCookie,
  COOKIE_OPTIONS,
  COOKIE_SID,
  COOKIE_SID_R,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL,
  USER_COOKIE_TTL,
  ROTATED_RETENTION
} from './cookie.js';
import { loadUserPermissions } from './permission-loader.js';

const MAX_REFRESH_TOKENS = parseInt(process.env.MAX_REFRESH_TOKENS) || 10;
/**
 * 同一用户活跃设备行数上限（session_tokens 表 revoked=false 的行）。
 *
 * x-device-id 头客户端可控，同一用户每次传随机新 deviceId 会绕过
 * findOrCreate(user_id+device_id) 的设备幂等键，无限新增 session_tokens 行 →
 * 设备数统计失真 + DB 膨胀。此上限在 createSession 写 DB 前裁剪最旧行，
 * 只保留最近 N 个活跃设备。默认 20 覆盖正常用户多端场景（手机/电脑/平板/多浏览器）。
 */
const MAX_ACTIVE_DEVICES = parseInt(process.env.MAX_ACTIVE_DEVICES) || 20;
// 设备类型常量与判定统一由 device.js 提供，此处导入为本地绑定并在文件末尾 re-export
import { DEVICE_TYPE, detectDeviceType, computeDeviceFingerprint } from './device.js';

/** 认证调试开关 */
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';
function _debug(...args) {
  if (DEBUG_AUTH) console.log('[Auth Debug]', ...args);
}

// 统一存储实例（getStore 自动处理 Redis/MapStore、超时、序列化）
const sessionStore = getStore('session');
const refreshStore = getStore('refresh');
const userRefreshStore = getStore('user_refresh');
// sid_r 轮转后旧 refreshToken 的"已轮转"标记（供复用盗用检测），TTL=ROTATED_RETENTION
const rotatedStore = getStore('refresh_rotated');
// family 集合：familyId → zset[refreshToken]，用于盗用检测后只吊销同 family
const familyStore = getStore('session_family');
// 用户会话索引：userId → zset[raw sessionId]，供 kick/单设备互踢按 raw sid 定位 Redis session
// （DB 仅存 sha256(sessionId) 无法反查 raw sid，故用 Redis 逆索引，不暴露 raw sid 到 DB）
const userSessionsStore = getStore('user_sessions');

/** sessionId → DB token 列存的哈希（sha256），集中一处避免散落 */
function sidHash(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

/**
 * 踢单条 session 的公共逻辑
 *
 * 删 Redis session + 失效 sid_r + DB 标记 revoked + 清 user_sessions 索引 + 写 SessionLog。
 * 供 kickByDeviceType / kickByDeviceId / kickUser 等复用，保证踢出路径一致。
 *
 * @param {number} userId 用户 ID
 * @param {string} sid raw sessionId（user_sessions 索引里的值）
 * @param {object} sd 该 sid 的 Redis session 数据（含 familyId/deviceId/deviceType/appId）
 * @param {string} appId 归属应用（写日志用）
 * @param {object} logDetails SessionLog.details 额外字段
 */
async function _kickSession(userId, sid, sd, appId, logDetails) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');
  const familyId = sd?.familyId || null;
  await sessionStore.delete(sid);
  await deleteRefreshTokensForSession(userId, sid, familyId);
  await SessionToken.update({ revoked: true }, { where: { token: sidHash(sid) } });
  await userSessionsStore.zRem(String(userId), [sid]);
  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    app_id: appId,
    details: { ...logDetails, kickedSessionId: sid }
  });
}

/**
 * 踢掉同设备类型的旧会话（单设备单登录，按 deviceType 粗粒度批量踢）
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {string} deviceType 设备类型
 */
async function kickByDeviceType(userId, appId, deviceType) {
  const target = deviceType || DEVICE_TYPE.BROWSER;
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    if (!sd) {
      await userSessionsStore.zRem(String(userId), [sid]);
      continue;
    }
    if (sd.appId === appId && (sd.deviceType || DEVICE_TYPE.BROWSER) === target) {
      await _kickSession(userId, sid, sd, appId, { reason: 'single_device_login', deviceType: target });
    }
  }
}

/**
 * 按 device_id 精准踢单设备会话
 *
 * 区别于 kickByDeviceType（按设备类型批量踢，同类型多设备会误踢），
 * 本函数只踢 user_id+device_id 指定的那台设备，用于"管理端远程踢单设备"等场景。
 * session_tokens 有 device_id 索引，但 DB 只存 sha256(sid) 无法反查 raw sid，
 * 故仍走 user_sessions 逆索引遍历，按 sd.deviceId 精确匹配。
 *
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {string} deviceId 设备 ID（结构化 WEB-... 形式）
 * @returns {number} 踢出的会话数
 */
async function kickByDeviceId(userId, appId, deviceId) {
  if (!deviceId) return 0;
  let kicked = 0;
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    if (!sd) {
      await userSessionsStore.zRem(String(userId), [sid]);
      continue;
    }
    if (sd.appId === appId && sd.deviceId === deviceId) {
      await _kickSession(userId, sid, sd, appId, { reason: 'kick_by_device_id', deviceId });
      kicked++;
    }
  }
  return kicked;
}

/**
 * 检查并发会话数
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {number} maxSessions 最大并发会话数（默认 5）
 * @returns {null|object} null=未超限，object=超限返回活跃会话列表
 */
async function checkMaxSessions(userId, appId, maxSessions = 5) {
  const SessionToken = getModel('SessionToken');

  // 先回收已过期的会话：DB 行不会随 Redis TTL 自动消失，需在此标记 revoked，
  // 否则过期会话堆积会占用并发名额，导致新登录被 MAX_SESSIONS 误拦。
  // 以最长 TTL（长期登录 30 天）为回收阈值，超过即视为过期。
  const expiryThreshold = new Date(Date.now() - LONG_SESSION_TTL * 1000);
  const expiredCount = await SessionToken.update(
    { revoked: true },
    {
      where: {
        user_id: userId,
        app_id: appId,
        revoked: false,
        last_active: { [Op.lt]: expiryThreshold }
      }
    }
  );
  if (expiredCount?.[0] > 0) {
    _debug('🔍 [session] 回收 %s 条过期会话: userId=%s, appId=%s', expiredCount[0], userId, appId);
  }

  // 按应用过滤：遍历 user_sessions 索引统计该应用的活跃会话（Redis 仍存活的才算）
  // 顺带清理索引中 Redis 已过期的僵尸条目
  const allSids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  const sessions = [];
  for (const sid of allSids) {
    const sd = await sessionStore.get(sid);
    if (!sd) {
      await userSessionsStore.zRem(String(userId), [sid]);
      continue;
    }
    if (sd.appId !== appId) continue;
    sessions.push({
      sessionId: sid,
      ip: sd.ip,
      userAgent: sd.userAgent,
      lastActive: sd.lastActiveAt,
      deviceType: sd.deviceType || DEVICE_TYPE.BROWSER,
      appId: sd.appId
    });
  }

  if (sessions.length < maxSessions) return null;

  return { maxSessions, current: sessions.length, sessions };
}

/**
 * 裁剪同用户的活跃设备行数至上限以下
 *
 * 治理 x-device-id 客户端可控导致的 session_tokens 膨胀：同用户每次传随机新 deviceId
 * 绕过 findOrCreate 幂等键，行数无限增长。此函数在 createSession 写新行前调用，
 * 先删最旧的活跃行腾位，保证表内活跃设备行 ≤ MAX_ACTIVE_DEVICES。
 *
 * 删除策略：按 last_active 升序删 (count - MAX + 1) 条最旧的活跃行（revoked=false）。
 * 不影响已被 checkMaxSessions 标记 revoked 的历史行（保留审计）。
 * SessionToken 无 paranoid/软删钩子，destroy 为硬删除（膨胀治理应真删行不留壳）。
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<number>} 实际删除的行数
 */
async function pruneActiveDevices(userId) {
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return 0;

  // 只数活跃行（revoked=false），超上限才清
  const activeCount = await SessionToken.count({ where: { user_id: userId, revoked: false } });
  if (activeCount < MAX_ACTIVE_DEVICES) return 0;

  const removeCount = activeCount - MAX_ACTIVE_DEVICES + 1;
  // 按 last_active 升序取最旧的 removeCount 条活跃行
  const oldest = await SessionToken.findAll({
    where: { user_id: userId, revoked: false },
    order: [['last_active', 'ASC']],
    limit: removeCount,
    attributes: ['id']
  });
  if (!oldest.length) return 0;

  // 批量软删除：触发 beforeBulkDestroy 钩子写 delete_version
  // （SessionToken 注册了 registerDeleteVersionHooks，批量 destroy 走 paranoid 软删）
  const destroyed = await SessionToken.destroy({
    where: { id: oldest.map(r => r.id) }
  });
  _debug(
    '🧹 [session] 裁剪活跃设备: userId=%s, 删除 %s 行 (原 %s, 上限 %s)',
    userId,
    destroyed,
    activeCount,
    MAX_ACTIVE_DEVICES
  );
  return destroyed;
}

/**
 * 踢掉指定会话
 *
 * 完整踢出（含记住我用户）：删 sid（立即失效）+ 失效 sid_r（阻止 sid_r 自动刷新恢复）
 * + DB revoke（兜底，refreshSession DB 降级也找不到）+ 清用户会话索引。
 * @param {string} sessionId 要踢掉的会话 ID（raw sid）
 * @param {number} userId 操作者用户 ID
 */
async function kickSession(sessionId, userId) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 先读 session 取 familyId（删 Redis 前读取），用于清理该 session 的 sid_r
  const sd = await sessionStore.get(sessionId);
  const familyId = sd?.familyId || null;

  // 1. 删 sid（立即生效：下个请求 401）
  await sessionStore.delete(sessionId);

  // 2. 失效 sid_r：删映射到本 session 的 refreshToken + 清 family 集合（防记住我用户靠 sid_r 自动恢复）
  if (userId != null) {
    await deleteRefreshTokensForSession(userId, sessionId, familyId);
  }

  // 3. DB revoke（兜底：refreshSession DB 降级也找不到未撤销 token）
  await SessionToken.update({ revoked: true }, { where: { token: sidHash(sessionId) } });
  if (userId != null) await userSessionsStore.zRem(String(userId), [sessionId]);

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    details: { reason: 'user_kicked', kickedSessionId: sessionId }
  });
}

/**
 * 踢掉用户所有会话（含记住我：sid + sid_r + DB 全清）
 * @param {number} userId 用户 ID
 */
async function kickAllSessions(userId) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 用逆索引遍历 raw sid：删 Redis session + 失效 sid_r + DB revoke + 清索引
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  const hashes = [];
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    const familyId = sd?.familyId || null;
    await sessionStore.delete(sid);
    // 失效该 session 的 sid_r（防记住我用户靠 sid_r 自动恢复）
    await deleteRefreshTokensForSession(userId, sid, familyId);
    hashes.push(sidHash(sid));
  }
  if (hashes.length) {
    await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
  }

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    details: { reason: 'kick_all', count: sids.length }
  });
}

/**
 * 创建会话
 * @param {object} params
 * @param {number} params.userId 用户内部 ID
 * @param {string} params.uid 用户 UUID
 * @param {string} params.username 用户名
 * @param {string} params.email 邮箱
 * @param {string} params.avatar 头像
 * @param {number} params.status 用户状态
 * @param {string} params.appId 登录的应用 ID
 * @param {string} params.ip 客户端 IP
 * @param {string} params.deviceId 设备标识
 * @param {string} params.deviceType 设备类型（browser/app/desktop/miniapp/api）
 * @param {string} params.userAgent User-Agent
 * @param {boolean} params.rememberMe 是否长期登录
 * @param {boolean} [params.multiDevice=false] 是否允许多设备登录，true=不踢旧会话，false=同设备类型只允许一个
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 * @returns {Promise<{sessionId: string, refreshToken: string|null, familyId: string}>} 会话标识与刷新令牌
 */
async function createSession(params) {
  const {
    userId,
    uid,
    username,
    email,
    avatar,
    status,
    appId,
    ip,
    deviceId,
    deviceType,
    userAgent,
    rememberMe,
    reply
  } = params;

  // 1. 并发会话限制：检查是否超限（不自动踢人，由调用方处理）
  const maxSessionsResult = await checkMaxSessions(userId, appId);
  if (maxSessionsResult) {
    const err = new Error('MAX_SESSIONS_EXCEEDED');
    err.code = 'MAX_SESSIONS_EXCEEDED';
    err.sessions = maxSessionsResult.sessions;
    err.maxSessions = maxSessionsResult.maxSessions;
    throw err;
  }

  // 2. 单设备单登录：踢掉同用户同应用同设备类型的旧会话
  // multiDevice=true 时允许多设备登录，不踢旧会话
  if (!params.multiDevice) {
    await kickByDeviceType(userId, appId, deviceType || DEVICE_TYPE.BROWSER);
  }

  // 2. 加载该用户在该应用的角色和权限
  const { roles, permissions } = await loadUserPermissions(userId, appId);

  // 2. 生成 sessionId、refreshToken、familyId
  // familyId 标识同一登录链，供 sid_r 轮转盗用检测后只吊销同 family（不影响该用户其他设备）
  const sessionId = crypto.randomBytes(32).toString('hex');
  const refreshToken = rememberMe ? crypto.randomBytes(32).toString('hex') : null;
  const familyId = crypto.randomBytes(16).toString('hex');

  // 复合设备指纹（device_id + UA + uid，绑定设备+账号）
  // 既写入 Redis session（访问风险检测基准，零 DB 查询），也写入 session_tokens 表（持久备份）
  const deviceFingerprint = computeDeviceFingerprint({
    deviceId,
    userAgent,
    uid,
    platformHint: '' // UA 已含足够信息，platformHint 可选
  });

  // 3. 构造 session 数据
  //    deviceFingerprint 作为访问时风险检测的基准（device_id + UA + uid 算出的复合指纹）
  //    写入 Redis session，访问时 getSession 直接取，避免每次请求查 session_tokens 表
  const sessionData = {
    userId,
    uid,
    username,
    email,
    avatar,
    status,
    appId,
    roles,
    permissions,
    ip,
    deviceId,
    deviceFingerprint, // 基准指纹，访问时比对当前请求算出的指纹
    deviceType: deviceType || DEVICE_TYPE.BROWSER,
    userAgent,
    familyId,
    loginAt: Math.floor(Date.now() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: !!rememberMe
  };

  // 4. Redis 存储
  const sessionTtl = rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;

  await sessionStore.set(sessionId, sessionData, sessionTtl);

  // 记录到用户会话索引（raw sid），供 kick/单设备互踢按 raw sid 定位 Redis session
  await userSessionsStore.zAdd(String(userId), Date.now(), sessionId);
  await userSessionsStore.expire(String(userId), LONG_SESSION_TTL);

  if (refreshToken) {
    // 清理超出限制的旧 refresh token
    const count = await userRefreshStore.zCard(String(userId));
    if (count >= MAX_REFRESH_TOKENS) {
      // 删除最久未刷新的（score 最小的）
      const removeCount = count - MAX_REFRESH_TOKENS + 1;
      const oldTokens = await userRefreshStore.zRangeByScore(String(userId), '-inf', '+inf', {
        LIMIT: { offset: 0, count: removeCount }
      });
      for (const oldRt of oldTokens) {
        const oldSessionId = await refreshStore.get(oldRt);
        if (oldSessionId) await sessionStore.delete(oldSessionId);
        await refreshStore.delete(oldRt);
      }
      await userRefreshStore.zRem(String(userId), oldTokens);
    }

    // 写入新的 refresh token
    await refreshStore.set(refreshToken, sessionId, USER_COOKIE_TTL);
    // 记录到用户的 refresh 索引（score = 当前时间戳）
    await userRefreshStore.zAdd(String(userId), Date.now(), refreshToken);
    await userRefreshStore.expire(String(userId), USER_COOKIE_TTL);
    // 记录到 family 集合（供 sid_r 盗用检测后只吊销同 family）
    await familyStore.zAdd(familyId, Date.now(), refreshToken);
    await familyStore.expire(familyId, USER_COOKIE_TTL);
  }

  // 5. DB 写入
  const UserSession = getModel('UserSession');
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 更新用户全局会话
  await UserSession.upsert({
    user_id: userId,
    last_login_at: new Date(),
    last_login_ip: ip,
    last_login_app: appId,
    last_active_at: new Date()
  });

  // 记录设备 Token
  const tokenHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  // deviceFingerprint 已在上方 sessionData 构造前计算（复用同一值写 DB）

  // 设备幂等：同一用户同一设备只保留一条 session_token（有就更新，无才新增）
  // 防止 session_tokens 表按登录次数堆积。deviceId 为空时退化为 destroy+create。
  if (deviceId) {
    try {
      // upsert 语义：同 user_id + device_id 命中则更新 token/ip/UA/fingerprint/时间/revoked=false
      const [tokenRow, created] = await SessionToken.findOrCreate({
        where: { user_id: userId, device_id: deviceId },
        defaults: {
          app_id: appId,
          device_id: deviceId,
          device_fingerprint: deviceFingerprint,
          token: tokenHash,
          ip,
          user_agent: userAgent,
          last_active: new Date(),
          revoked: false
        }
      });
      if (!created) {
        // 已存在：更新为最新登录信息（token 轮换 + 指纹刷新 + 复活 revoked）
        await tokenRow.update({
          app_id: appId,
          device_fingerprint: deviceFingerprint,
          token: tokenHash,
          ip,
          user_agent: userAgent,
          last_active: new Date(),
          revoked: false
        });
      } else {
        // 新增设备行：裁剪同用户活跃设备至上限，防 x-device-id 可控导致 session_tokens 膨胀
        // （刚插入的新行 last_active 最新，prune 按 last_active 升序删最旧，不会误删本行）
        await pruneActiveDevices(userId);
      }
    } catch (err) {
      console.warn('[Session] upsert token 失败，回退 destroy+create:', err.message);
      await SessionToken.destroy({ where: { user_id: userId, device_id: deviceId, revoked: false } });
      await SessionToken.create({
        user_id: userId,
        app_id: appId,
        device_id: deviceId,
        device_fingerprint: deviceFingerprint,
        token: tokenHash,
        ip,
        user_agent: userAgent,
        last_active: new Date()
      });
    }
  } else {
    await SessionToken.create({
      user_id: userId,
      app_id: appId,
      device_id: deviceId,
      device_fingerprint: deviceFingerprint,
      token: tokenHash,
      ip,
      user_agent: userAgent,
      last_active: new Date()
    });
  }

  // 记录登录日志
  await SessionLog.create({
    user_id: userId,
    event: 'LOGIN',
    app_id: appId,
    ip,
    user_agent: userAgent,
    details: {
      rememberMe,
      deviceId,
      deviceType: deviceType || DEVICE_TYPE.BROWSER
    }
  });

  // 6. 下发 Cookie（accessCount 从 0 开始）
  const sidValue = signCookie(sessionId, 0);
  reply.setCookie(COOKIE_SID, sidValue, {
    ...COOKIE_OPTIONS.SID,
    maxAge: sessionTtl
  });

  if (refreshToken && rememberMe) {
    const sidRValue = signCookie(refreshToken, 0);
    reply.setCookie(COOKIE_SID_R, sidRValue, {
      ...COOKIE_OPTIONS.SID_R,
      maxAge: REFRESH_TOKEN_TTL
    });
  }

  return { sessionId, refreshToken, familyId };
}

/**
 * 从请求中验证并获取会话数据
 * @param {object} params
 * @param {object} params.cookies 请求的 cookies
 * @returns {object|null} 会话数据或 null
 */
async function getSession(params) {
  const { cookies, reply } = params;

  // 1. 解析 sid cookie
  const sidCookie = cookies[COOKIE_SID];
  if (!sidCookie) return null;

  const parsed = verifyCookie(sidCookie);
  if (!parsed) {
    _debug('❌ sid Cookie 签名验证失败');
    // 清失效 sid cookie，防下次请求携带坏 cookie 反复 401
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  const { sessionId, accessCount } = parsed;
  _debug('📋 sid 解析成功: sessionId=%s, accessCount=%s', sessionId, accessCount);

  // 3. Redis 查询
  _debug('📋 Redis 查询 session: %s', sessionId);
  const raw = await sessionStore.get(sessionId);
  _debug('📋 Redis 查询 raw: %s', raw);
  if (raw) {
    _debug('✅ Redis 命中: userId=%s, username=%s', raw.userId, raw.username);
    // 续期 + 重新签名 cookie（带 app 隔离的 path）
    const ttl = raw.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
    await sessionStore.expire(sessionId, ttl);
    if (reply) {
      const newSidValue = signCookie(sessionId, accessCount + 1);
      reply.setCookie(COOKIE_SID, newSidValue, {
        ...COOKIE_OPTIONS.SID,
        maxAge: ttl
      });
    }
    _debug('📋 Session 续期: TTL=%ss', ttl);
    return { ...raw, sessionId, accessCount: accessCount + 1 };
  }
  _debug('❌ Redis 未命中，降级到 DB');

  // 4. Redis 未命中，降级到 DB
  const tokenHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const SessionToken = getModel('SessionToken');
  const User = getModel('User');

  const token = await SessionToken.findOne({
    where: { token: tokenHash, revoked: false },
    include: [{ model: User, as: 'user', required: true }]
  });

  if (!token) {
    // DB 无有效 token（已 revoked/删除）→ 清 sid cookie 防带失效 sid
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  // TTL 判定：DB 不存 rememberMe，无法区分短/长期会话，按下方策略处理——
  //   超 LONG（30d）→ 真过期，revoke（无论是否记住我都已失效）
  //   超 SHORT 但未超 LONG → 不复活、不 revoke：可能是记住我会话被 Redis 驱逐，
  //     交由 /auth/v1/refresh-session 携 sid_r 恢复（避免误 revoke 致 sid_r 刷新找不到）
  //   未超 SHORT → 从 DB 恢复到 Redis（非记住我会话 Redis 短暂驱逐后复活）
  const shortExpiresAt = new Date(token.createdAt.getTime() + SHORT_SESSION_TTL * 1000);
  const longExpiresAt = new Date(token.createdAt.getTime() + LONG_SESSION_TTL * 1000);

  if (Date.now() > longExpiresAt.getTime()) {
    _debug('❌ Session 已超过长期 TTL（创建于 %s），标记 revoked 并拒绝', token.createdAt.toISOString());
    await token.update({ revoked: true });
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  if (Date.now() > shortExpiresAt.getTime()) {
    // 短期已过、长期未过：不复活、不 revoke，让前端走 sid_r 刷新（记住我）或重登（非记住我）
    // 清 sid cookie（已失效），下次请求无 sid → 前端直接走 refresh-session（sid_r 仍在）
    _debug(
      '⏭️ Redis 未命中且超短期 TTL（创建于 %s），清 sid cookie 交由 sid_r 刷新恢复',
      token.createdAt.toISOString()
    );
    if (reply) reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    return null;
  }

  // 短期 TTL 内：重建 Redis 缓存
  const user = token.user;
  const { roles, permissions } = await loadUserPermissions(user.id, token.app_id);

  // 从 session_tokens 表补 device_fingerprint（DB 降级时 token 不含指纹，查最新一条补上，
  // 否则 detectSessionRisk 走 no_baseline 降级 info 放行，风险检测形同虚设）
  let deviceFingerprint = null;
  if (token.device_id) {
    const SessionToken = getModel('SessionToken');
    const st = await SessionToken.findOne({
      where: { device_id: token.device_id, user_id: user.id },
      order: [['last_active', 'DESC']]
    });
    if (st?.device_fingerprint) {
      deviceFingerprint = st.device_fingerprint;
    }
  }

  const sessionData = {
    userId: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
    appId: token.app_id,
    roles,
    permissions,
    ip: token.ip,
    deviceId: token.device_id,
    deviceFingerprint, // 降级补的指纹基准（查不到时为 null，detectSessionRisk 走 info 降级）
    userAgent: token.user_agent,
    loginAt: Math.floor(token.createdAt.getTime() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: false
  };

  await sessionStore.set(sessionId, sessionData, SHORT_SESSION_TTL);

  // 重新签名 cookie（带 app 隔离的 path）
  if (reply) {
    const newSidValue = signCookie(sessionId, 0);
    reply.setCookie(COOKIE_SID, newSidValue, {
      ...COOKIE_OPTIONS.SID,
      maxAge: SHORT_SESSION_TTL
    });
  }

  return { ...sessionData, sessionId };
}

/**
 * 刷新会话核心：用 refreshToken 验证 + 轮转新 sid/sid_r
 *
 * 供 refreshSession（sid 过期自动续期）与 switchSessionByRefreshToken（账号免密切换）复用。
 * refreshToken 来源不同（cookie / 注册表），核心一致：盗用检测 → DB 验证 →
 * 轮转新 session + 新 refreshToken → 下发新 sid/sid_r cookie。
 *
 * 失败路径不清 cookie（由调用方决定：自动刷新清，切换不清）。
 *
 * @param {string} refreshToken - 原始 refreshToken
 * @param {import('fastify').FastifyRequest} [request]
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<{sessionData: object, newSessionId: string, newRefreshToken: string} | null>}
 *   null=refreshToken 无效/被盗用/用户禁用
 */
async function refreshSessionCore(refreshToken, request, reply) {
  // 1. 盗用检测：该 refreshToken 是否已被轮转（旧 sid_r 再用 = 盗用）
  const rotated = await rotatedStore.get(refreshToken);
  if (rotated) {
    request?.log?.warn(
      { familyId: rotated.familyId, userId: rotated.userId },
      '🚨 [Session] sid_r 复用盗用，吊销同 family'
    );
    await revokeFamily(rotated.familyId, rotated.userId);
    return null;
  }

  // 2. Redis 查询 refreshToken 对应的旧 sessionId
  const oldSessionId = await refreshStore.get(refreshToken);

  // 3. DB 查询会话记录（createSession 存储的是 sha256(sessionId)）
  const SessionToken = getModel('SessionToken');
  let record = null;

  if (oldSessionId) {
    // 优先用 Redis 中的 oldSessionId 精确查找
    const oldHash = crypto.createHash('sha256').update(oldSessionId).digest('hex');
    record = await SessionToken.findOne({ where: { token: oldHash, revoked: false } });
  }

  // Redis 未命中时，降级用 refreshToken 哈希查找（兼容旧数据）
  if (!record) {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    record = await SessionToken.findOne({ where: { token: refreshTokenHash, revoked: false } });
  }

  if (!record) return null;

  // 4. 加载用户信息和权限
  const User = getModel('User');
  const user = await User.findByPk(record.user_id);
  if (!user) return null;

  const { roles, permissions } = await loadUserPermissions(user.id, record.app_id);

  // 5. 取 familyId（优先旧 Redis session，否则新建孤儿 family）
  let familyId = null;
  if (oldSessionId) {
    familyId = (await sessionStore.get(oldSessionId))?.familyId;
  }
  if (!familyId) familyId = crypto.randomBytes(16).toString('hex');

  // 5.1 用户已禁用：吊销整个 family，拒绝刷新（防止禁用后靠 sid_r 续期 30 天）
  if (user.status === 0) {
    _debug('🚫 [Session] 用户已禁用，拒绝刷新并吊销 family: userId=%s', user.id);
    await revokeFamily(familyId, user.id);
    return null;
  }

  // 6. 每次刷新轮转 sid_r：生成新 sessionId + 新 refreshToken
  const newSessionId = crypto.randomBytes(32).toString('hex');
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const sessionTtl = LONG_SESSION_TTL;

  const sessionData = {
    userId: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
    appId: record.app_id,
    roles,
    permissions,
    ip: request?.ip || record.ip,
    deviceId: record.device_id,
    userAgent: request?.headers?.['user-agent'] || record.user_agent,
    familyId,
    loginAt: Math.floor(record.createdAt.getTime() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: true
  };

  // 7. 失效旧 sid_r：标记已轮转（供盗用检测）+ 删活跃映射 + 删旧 session + 清索引/family
  await rotatedStore.set(refreshToken, { familyId, userId: user.id }, ROTATED_RETENTION);
  await refreshStore.delete(refreshToken);
  await userRefreshStore.zRem(String(user.id), [refreshToken]);
  await familyStore.zRem(familyId, [refreshToken]); // 清 family 集合中的旧 RT，避免膨胀
  if (oldSessionId) {
    await sessionStore.delete(oldSessionId);
    await userSessionsStore.zRem(String(user.id), [oldSessionId]); // 清旧 sid 索引
  }

  // 8. 新 refreshToken → newSessionId（滑动 30d）+ family/会话索引
  await sessionStore.set(newSessionId, sessionData, sessionTtl);
  await refreshStore.set(newRefreshToken, newSessionId, USER_COOKIE_TTL);
  await userRefreshStore.zAdd(String(user.id), Date.now(), newRefreshToken);
  await userRefreshStore.expire(String(user.id), USER_COOKIE_TTL);
  await familyStore.zAdd(familyId, Date.now(), newRefreshToken);
  await familyStore.expire(familyId, USER_COOKIE_TTL);
  // 新 session 入用户会话索引（供后续 kick 定位）
  await userSessionsStore.zAdd(String(user.id), Date.now(), newSessionId);
  await userSessionsStore.expire(String(user.id), LONG_SESSION_TTL);

  // 9. DB 更新 token 哈希
  const newTokenHash = crypto.createHash('sha256').update(newSessionId).digest('hex');
  await record.update({ token: newTokenHash, last_active: new Date() });

  // 10. 记录刷新日志（关联用户，操作留痕）
  const SessionLog = getModel('SessionLog');
  await SessionLog.create({
    user_id: record.user_id,
    event: 'SESSION_REFRESH',
    app_id: record.app_id,
    ip: record.ip,
    user_agent: record.user_agent,
    details: {
      oldSessionId: oldSessionId || '-',
      newSessionId,
      rotatedRefreshToken: true,
      reason: 'cookie_expired_auto_refresh'
    }
  });

  // 11. 下发新 sid + 新 sid_r（每次轮转）
  reply.setCookie(COOKIE_SID, signCookie(newSessionId, 0), {
    ...COOKIE_OPTIONS.SID,
    maxAge: sessionTtl
  });
  reply.setCookie(COOKIE_SID_R, signCookie(newRefreshToken, 0), {
    ...COOKIE_OPTIONS.SID_R,
    maxAge: REFRESH_TOKEN_TTL
  });

  return { sessionData, newSessionId, newRefreshToken };
}

/**
 * 刷新会话 (sid 过期时用 sid_r 自动续期)
 * @param {object} params
 * @param {object} params.cookies 请求的 cookies
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 * @param {import('fastify').FastifyRequest} [params.request]
 * @returns {Promise<object|null>} 新的会话数据或 null
 */
async function refreshSession({ cookies, reply, request }) {
  // 1. 解析 sid_r cookie
  const sidRCookie = cookies[COOKIE_SID_R];
  if (!sidRCookie) return null;

  const parsed = verifyCookie(sidRCookie);
  if (!parsed) return null;

  const refreshToken = parsed.sessionId; // sid_r cookie 中存储的 payload 是 refreshToken

  const result = await refreshSessionCore(refreshToken, request, reply);
  if (!result) {
    // 刷新失败：清 sid/sid_r cookie 强制重新登录
    reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
    reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });
    return null;
  }
  return { ...result.sessionData, sessionId: result.newSessionId };
}

/**
 * 用指定 refreshToken 免密切换账号（抖音式）
 *
 * refreshToken 来自前端 localStorage（多账号免切凭证，登录时 bind-session 响应返回），
 * 非 cookie（单 sid cookie 模型下浏览器只存当前账号的 sid_r）。
 * 复用 refreshSessionCore：验证 refreshToken + 轮转新 sid/sid_r。
 *
 * 成功后旧 refreshToken 标记 rotated 失效，调用方必须用返回的新 sessionId/newRefreshToken
 * 更新注册表，否则下次切换会触发盗用检测吊销整个 family。
 *
 * @param {string} refreshToken - 注册表存储的目标账号 refreshToken
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {Promise<{sessionId: string, refreshToken: string, user: object} | null>}
 *   null=refreshToken 已轮转/被吊销/用户禁用
 */
async function switchSessionByRefreshToken(refreshToken, request, reply) {
  const result = await refreshSessionCore(refreshToken, request, reply);
  if (!result) return null;
  const { sessionData, newSessionId, newRefreshToken } = result;
  return {
    sessionId: newSessionId,
    refreshToken: newRefreshToken,
    user: {
      id: sessionData.userId,
      uid: sessionData.uid,
      username: sessionData.username,
      name: sessionData.username,
      email: sessionData.email,
      avatar: sessionData.avatar
    }
  };
}

/**
 * 吊销整个 family（sid_r 盗用检测命中时调用）
 * 删除该 family 下所有 session/refreshToken/轮转标记，并 revoke 对应 DB token
 * @param {string} familyId 会话家族 ID
 * @param {number|null} [userId] 用户 ID（用于清理 user_refresh 索引）
 */
async function revokeFamily(familyId, userId = null) {
  const rts = await familyStore.zRangeByScore(familyId, '-inf', '+inf');
  const SessionToken = getModel('SessionToken');
  const hashes = [];
  for (const rt of rts) {
    const sid = await refreshStore.get(rt);
    if (sid) {
      await sessionStore.delete(sid);
      if (userId != null) await userSessionsStore.zRem(String(userId), [sid]); // 清会话索引
      hashes.push(sidHash(sid));
    }
    await refreshStore.delete(rt);
    await rotatedStore.delete(rt);
    if (userId != null) await userRefreshStore.zRem(String(userId), [rt]);
  }
  if (hashes.length) {
    await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
  }
  await familyStore.delete(familyId);
}

/**
 * 删除指定 session 对应的所有 refreshToken（取消"记住我"/登出时调用）
 * 遍历用户 refresh 索引，删除映射到本 sessionId 的 refreshToken + 清理 family 集合
 * @param {number} userId 用户 ID
 * @param {string} sessionId 会话 ID
 * @param {string|null} [familyId] 会话家族 ID（用于清理 family 集合）
 */
async function deleteRefreshTokensForSession(userId, sessionId, familyId = null) {
  const rts = await userRefreshStore.zRangeByScore(String(userId), '-inf', '+inf');
  for (const rt of rts) {
    if ((await refreshStore.get(rt)) === sessionId) {
      await refreshStore.delete(rt);
      await userRefreshStore.zRem(String(userId), [rt]);
      if (familyId) await familyStore.zRem(familyId, [rt]);
    }
  }
}

/**
 * 动态切换当前会话的"记住我"状态（update-remember-me 路由调用）
 * - 开启：session TTL→长期，新增长期 refreshToken（入 family）
 * - 关闭：session TTL→30min，删除该 session 的所有 refreshToken
 * Redis 与 cookie 由本函数 + 调用方分别负责：本函数管 Redis，调用方管 cookie
 * @param {number} userId 用户 ID
 * @param {string} sessionId 会话 ID
 * @param {boolean} rememberMe 是否长期登录
 * @returns {Promise<{refreshToken: string|null}>} 开启时返回新 refreshToken（供设 sid_r cookie）
 */
async function updateRememberMe(userId, sessionId, rememberMe) {
  const sessionData = await sessionStore.get(sessionId);
  if (!sessionData) {
    throw new Error('SESSION_NOT_FOUND');
  }
  const familyId = sessionData.familyId || crypto.randomBytes(16).toString('hex');
  sessionData.familyId = familyId;
  sessionData.rememberMe = !!rememberMe;

  if (rememberMe) {
    // 缓存转长期
    await sessionStore.set(sessionId, sessionData, LONG_SESSION_TTL);
    // 新增长期 refresh token（入 family）
    const refreshToken = crypto.randomBytes(32).toString('hex');
    await refreshStore.set(refreshToken, sessionId, USER_COOKIE_TTL);
    await userRefreshStore.zAdd(String(userId), Date.now(), refreshToken);
    await userRefreshStore.expire(String(userId), USER_COOKIE_TTL);
    await familyStore.zAdd(familyId, Date.now(), refreshToken);
    await familyStore.expire(familyId, USER_COOKIE_TTL);
    return { refreshToken };
  }

  // 关闭：缓存转 30min + 删长期 refresh
  await sessionStore.set(sessionId, sessionData, SHORT_SESSION_TTL);
  await deleteRefreshTokensForSession(userId, sessionId, familyId);
  return { refreshToken: null };
}

/**
 * 销毁会话 (登出)
 * @param {object} params
 * @param {string} params.sessionId 会话 ID
 * @param {number} params.userId 用户 ID (用于日志)
 * @param {string} params.appId 应用 ID (用于日志)
 * @param {string} params.ip 客户端 IP
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 */
async function destroySession(params) {
  const { sessionId, userId, appId, ip, reply } = params;

  // 1. 删 Redis session + 用户会话索引（当前会话立即失效）
  if (sessionId) {
    await sessionStore.delete(sessionId);
    if (userId != null) await userSessionsStore.zRem(String(userId), [sessionId]);
  }

  // 2. 清 sid + sid_r cookie（彻底结束当前登录态，sid_r 没了 → 前端 401 无法自动 refresh-session 恢复）
  //    注意：不删 refreshToken 映射、不 revoke DB token——保留供前端 localStorage 凭证
  //    主动调 /switch-account 免密切换（refreshToken 是 localStorage 持有的，非 cookie）
  reply.clearCookie(COOKIE_SID, { ...COOKIE_OPTIONS.SID });
  reply.clearCookie(COOKIE_SID_R, { ...COOKIE_OPTIONS.SID_R });

  // 3. 记录日志
  const SessionLog = getModel('SessionLog');
  await SessionLog.create({
    user_id: userId,
    event: 'LOGOUT',
    app_id: appId,
    ip
  });
}

/**
 * 彻底撤销某账号的记住我凭证（"忘掉该账号"用）
 *
 * 与 destroySession 的软退出相反：删 refreshToken 映射 + family + rotated 标记 + DB revoke token +
 * 清 Redis session。前端 localStorage 持有 refreshToken（多账号凭证），移除账号时前端把
 * 对应 refreshToken 发来，后端据此反查 sessionId/userId/familyId 全套撤销。
 *
 * @param {string} refreshToken - 前端持有的目标账号 refreshToken
 */
async function revokeRememberMe(refreshToken) {
  if (!refreshToken) return;
  const SessionToken = getModel('SessionToken');

  // 1. refreshToken → oldSessionId → session data（userId/familyId）
  const oldSessionId = await refreshStore.get(refreshToken);
  let userId = null;
  let familyId = null;
  if (oldSessionId) {
    const sd = await sessionStore.get(oldSessionId);
    userId = sd?.userId ?? null;
    familyId = sd?.familyId ?? null;
  }

  // 2. 删 refreshToken 映射 + family 集合 + 轮转标记
  await refreshStore.delete(refreshToken);
  if (userId != null) await userRefreshStore.zRem(String(userId), [refreshToken]);
  await rotatedStore.delete(refreshToken);
  if (familyId) await familyStore.zRem(familyId, [refreshToken]);

  // 3. 删 Redis session + 清用户会话索引 + DB revoke token
  if (oldSessionId) {
    await sessionStore.delete(oldSessionId);
    if (userId != null) await userSessionsStore.zRem(String(userId), [oldSessionId]);
    const tokenHash = crypto.createHash('sha256').update(oldSessionId).digest('hex');
    await SessionToken.update({ revoked: true }, { where: { token: tokenHash } });
  }
}

/**
 * 踢用户下线 (管理员操作)
 * @param {number} userId 用户 ID
 * @param {string|null} appId 指定应用 (null = 全部应用)
 */
async function kickUser(userId, appId = null) {
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 用逆索引遍历 raw sid；按 appId 过滤（null=全部应用）
  const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
  const hashes = [];
  let kicked = 0;
  for (const sid of sids) {
    const sd = await sessionStore.get(sid);
    if (appId) {
      if (!sd) {
        await userSessionsStore.zRem(String(userId), [sid]);
        continue;
      }
      if (sd.appId !== appId) continue;
    }
    const familyId = sd?.familyId || null;
    await sessionStore.delete(sid);
    // 失效该 session 的 sid_r（防记住我用户靠 sid_r 自动恢复）
    await deleteRefreshTokensForSession(userId, sid, familyId);
    await userSessionsStore.zRem(String(userId), [sid]);
    hashes.push(sidHash(sid));
    kicked++;
  }
  if (hashes.length) {
    await SessionToken.update({ revoked: true }, { where: { token: { [Op.in]: hashes } } });
  }

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    app_id: appId || 'ALL',
    details: { kickedCount: kicked }
  });
}

/**
 * 记录登录失败日志
 * @param {object} params
 * @param {string} params.email 尝试登录的邮箱
 * @param {string} params.appId 应用 ID
 * @param {string} params.ip 客户端 IP
 * @param {string} params.userAgent User-Agent
 * @param {string} params.reason 失败原因
 * @param {string} [params.deviceType] 设备类型
 */
async function logLoginFailure(params) {
  const { email, appId, ip, userAgent, reason, deviceType } = params;

  const SessionLog = getModel('SessionLog');
  await SessionLog.create({
    user_id: null, // 登录失败时可能没有 userId
    event: 'LOGIN_FAILED',
    app_id: appId,
    ip,
    user_agent: userAgent,
    details: {
      email,
      reason,
      deviceType: deviceType || DEVICE_TYPE.BROWSER
    }
  });
}

/**
 * 获取会话统计信息
 * @returns {Promise<{onlineUsers: number, activeDevices: number, redisSessions: number}>}
 */
async function getSessionStats() {
  const SessionToken = getModel('SessionToken');
  const UserSession = getModel('UserSession');

  // 1. 在线用户数（最近 15 分钟有活跃记录）
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const onlineUsers = await UserSession.count({
    where: { last_active_at: { [Op.gte]: fifteenMinutesAgo } }
  });

  // 2. 活跃设备数（未撤销的会话）
  const activeDevices = await SessionToken.count({
    where: { revoked: false }
  });

  // 3. Redis 中的活跃 session 数（SCAN 遍历，避免 KEYS 阻塞）
  let redisSessions = 0;
  try {
    redisSessions = await sessionStore.size();
  } catch {
    // Redis 故障时忽略
  }

  return { onlineUsers, activeDevices, redisSessions };
}

/**
 * 获取登录趋势（最近 N 天的登录次数）
 * @param {number} days 天数（默认 7）
 * @returns {Promise<Array<{date: string, count: number}>>}
 */
async function getLoginTrend(days = 7) {
  const SessionLog = getModel('SessionLog');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const logs = await SessionLog.findAll({
    where: {
      event: 'LOGIN',
      created_at: { [Op.gte]: startDate }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
      [sequelize.fn('COUNT', '*'), 'count']
    ],
    group: [sequelize.fn('DATE', sequelize.col('created_at'))],
    order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
    raw: true
  });

  return logs.map(row => ({
    date: row.date,
    count: parseInt(row.count, 10)
  }));
}

/**
 * 更新会话基准（人机验证通过后调用）
 *
 * 用户在新环境（换设备/UA/IP）完成验证后，把当前请求的新基准写回 Redis session 数据 + DB session_tokens，
 * 后续请求不再报"指纹变了"。
 *
 * @param {string} sessionId - 会话 ID（request.state.user.sessionId）
 * @param {object} newBaseline - { deviceId, deviceFingerprint, ip, userAgent }
 */
async function updateSessionBaseline(sessionId, { deviceId, deviceFingerprint, ip, userAgent }) {
  if (!sessionId) return false;
  const sd = await sessionStore.get(sessionId);
  if (!sd) return false;

  // 更新基准字段
  if (deviceId !== undefined) sd.deviceId = deviceId;
  if (deviceFingerprint !== undefined) sd.deviceFingerprint = deviceFingerprint;
  if (ip !== undefined) sd.ip = ip;
  if (userAgent !== undefined) sd.userAgent = userAgent;
  sd.lastActiveAt = Math.floor(Date.now() / 1000);

  // 写回 Redis（保留原 TTL）
  const sessionTtl = sd.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
  await sessionStore.set(sessionId, sd, sessionTtl);

  // 同步 DB session_tokens（按 device_id 定位，更新 fingerprint/ip/UA/last_active）
  const SessionToken = getModel('session.SessionToken');
  if (SessionToken && sd.userId && sd.deviceId) {
    try {
      await SessionToken.update(
        {
          device_fingerprint: deviceFingerprint,
          ip,
          user_agent: userAgent,
          last_active: new Date()
        },
        { where: { user_id: sd.userId, device_id: sd.deviceId } }
      );
    } catch (err) {
      console.warn('[Session] 更新 session_tokens 基准失败:', err.message);
    }
  }
  return true;
}

export {
  DEVICE_TYPE,
  detectDeviceType,
  checkMaxSessions,
  kickSession,
  kickAllSessions,
  kickByDeviceId,
  createSession,
  getSession,
  refreshSession,
  refreshSessionCore,
  switchSessionByRefreshToken,
  destroySession,
  revokeRememberMe,
  deleteRefreshTokensForSession,
  updateRememberMe,
  updateSessionBaseline,
  kickUser,
  logLoginFailure,
  getSessionStats,
  getLoginTrend
};
