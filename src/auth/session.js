/**
 * Session 管理器
 * 负责会话的创建、验证、销毁、续期和自动刷新
 */
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import sequelize from '../db/index.js';
import {
  signCookie,
  verifyCookie,
  COOKIE_OPTIONS,
  COOKIE_SID,
  COOKIE_SID_R,
  SHORT_SESSION_TTL,
  LONG_SESSION_TTL,
  REFRESH_TOKEN_TTL
} from './cookie.js';
import { loadUserPermissions } from './permission-loader.js';
import { SESSION_CONFIG } from '../shared/config.js';

const SESSION_PREFIX = 'session:';
const REFRESH_PREFIX = 'refresh:';
const MAX_REFRESH_TOKENS = SESSION_CONFIG.maxRefreshTokens || 10;

/**
 * 设备类型常量
 */
export const DEVICE_TYPE = {
  BROWSER: 'browser', // 浏览器（Chrome/Firefox/Safari 等）
  APP: 'app', // 移动端 App
  DESKTOP: 'desktop', // 桌面客户端
  MINIAPP: 'miniapp', // 小程序
  API: 'api' // API 调用（服务间通信）
};

/**
 * 从 User-Agent 推断设备类型
 * @param {string} ua User-Agent 字符串
 * @returns {string} 设备类型
 */
export function detectDeviceType(ua) {
  if (!ua) return DEVICE_TYPE.API;
  const lower = ua.toLowerCase();
  if (lower.includes('miniprogram') || lower.includes('micromessenger'))
    return DEVICE_TYPE.MINIAPP;
  if (
    lower.includes('android') ||
    lower.includes('iphone') ||
    lower.includes('mobile')
  )
    return DEVICE_TYPE.APP;
  if (lower.includes('electron') || lower.includes('desktop'))
    return DEVICE_TYPE.DESKTOP;
  return DEVICE_TYPE.BROWSER;
}

/**
 * 踢掉同设备类型的旧会话（单设备单登录）
 * @param {object} redis Redis 客户端
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {string} deviceType 设备类型
 */
async function kickByDeviceType(redis, userId, appId, deviceType) {
  if (!redis) return;

  const { SessionToken, SessionLog } = sequelize.models;

  // 查找该用户在该应用下同设备类型的未撤销会话
  const oldTokens = await SessionToken.findAll({
    where: { user_id: userId, app_id: appId, revoked: false }
  });

  for (const token of oldTokens) {
    // 通过 Redis session 数据判断设备类型
    const sessionData = await redis.get(`${SESSION_PREFIX}${token.token}`);
    if (sessionData) {
      const data = JSON.parse(sessionData);
      if (data.deviceType === deviceType) {
        // 删除 Redis session
        await redis.del(`${SESSION_PREFIX}${token.token}`);
        // 标记 revoked
        await token.update({ revoked: true });
        // 记录日志
        await SessionLog.create({
          user_id: userId,
          event: 'KICK',
          app_id: appId,
          details: {
            reason: 'single_device_login',
            deviceType,
            kickedSessionId: token.token
          }
        });
      }
    }
  }
}

/**
 * 检查并发会话数
 * @param {object} redis Redis 客户端
 * @param {number} userId 用户 ID
 * @param {string} appId 应用 ID
 * @param {number} maxSessions 最大并发会话数（默认 5）
 * @returns {null|object} null=未超限，object=超限返回活跃会话列表
 */
export async function checkMaxSessions(redis, userId, appId, maxSessions = 5) {
  if (!redis) return null;

  const { SessionToken } = sequelize.models;

  // 按应用过滤：只计算当前应用的会话
  const tokens = await SessionToken.findAll({
    where: { user_id: userId, app_id: appId, revoked: false },
    order: [['last_active', 'ASC']]
  });

  if (tokens.length < maxSessions) return null;

  // 返回活跃会话列表，让调用方决定踢哪个
  const sessions = [];
  for (const t of tokens) {
    const sessionData = await redis.get(`${SESSION_PREFIX}${t.token}`);
    let info = { sessionId: t.token, ip: t.ip, userAgent: t.user_agent, lastActive: t.last_active };
    if (sessionData) {
      try {
        const d = JSON.parse(sessionData);
        info.deviceType = d.deviceType;
        info.appId = d.appId;
      } catch {}
    }
    sessions.push(info);
  }

  return { maxSessions, current: sessions.length, sessions };
}

/**
 * 踢掉指定会话
 * @param {object} redis Redis 客户端
 * @param {string} sessionId 要踢掉的会话 ID
 * @param {number} userId 操作者用户 ID
 */
export async function kickSession(redis, sessionId, userId) {
  const { SessionToken, SessionLog } = sequelize.models;

  await redis.del(`${SESSION_PREFIX}${sessionId}`);
  const token = await SessionToken.findOne({ where: { token: sessionId, revoked: false } });
  if (token) {
    await token.update({ revoked: true });
  }
  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    details: { reason: 'user_kicked', kickedSessionId: sessionId }
  });
}

/**
 * 踢掉用户所有会话
 */
export async function kickAllSessions(redis, userId) {
  const { SessionToken, SessionLog } = sequelize.models;

  const tokens = await SessionToken.findAll({
    where: { user_id: userId, revoked: false }
  });

  for (const t of tokens) {
    await redis.del(`${SESSION_PREFIX}${t.token}`);
    await t.update({ revoked: true });
  }

  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    details: { reason: 'kick_all', count: tokens.length }
  });
}

/**
 * 创建会话
 * @param {object} params
 * @param {object} params.redis Redis 客户端
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
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 * @returns {string} sessionId
 */
export async function createSession(params) {
  const {
    redis,
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
  const maxSessionsResult = await checkMaxSessions(redis, userId, appId);
  if (maxSessionsResult) {
    const err = new Error('MAX_SESSIONS_EXCEEDED');
    err.code = 'MAX_SESSIONS_EXCEEDED';
    err.sessions = maxSessionsResult.sessions;
    err.maxSessions = maxSessionsResult.maxSessions;
    throw err;
  }

  // 2. 单设备单登录：踢掉同用户同应用同设备类型的旧会话
  await kickByDeviceType(
    redis,
    userId,
    appId,
    deviceType || DEVICE_TYPE.BROWSER
  );

  // 2. 加载该用户在该应用的角色和权限
  const { roles, permissions } = await loadUserPermissions(userId, appId);

  // 2. 生成 sessionId 和 refreshToken
  const sessionId = crypto.randomBytes(32).toString('hex');
  const refreshToken = rememberMe
    ? crypto.randomBytes(32).toString('hex')
    : null;

  // 3. 构造 session 数据
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
    deviceType: deviceType || DEVICE_TYPE.BROWSER,
    userAgent,
    loginAt: Math.floor(Date.now() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: !!rememberMe
  };

  // 4. Redis 存储
  const sessionTtl = rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
  const userRefreshKey = `user_refresh:${userId}`;

  if (redis) {
    await redis.set(
      `${SESSION_PREFIX}${sessionId}`,
      JSON.stringify(sessionData),
      { EX: sessionTtl }
    );

    if (refreshToken) {
      // 清理超出限制的旧 refresh token
      const count = await redis.zCard(userRefreshKey);
      if (count >= MAX_REFRESH_TOKENS) {
        // 删除最久未刷新的（score 最小的）
        const removeCount = count - MAX_REFRESH_TOKENS + 1;
        const oldTokens = await redis.zRangeByScore(userRefreshKey, '-inf', '+inf', { LIMIT: { offset: 0, count: removeCount } });
        for (const oldRt of oldTokens) {
          const oldSessionId = await redis.get(`${REFRESH_PREFIX}${oldRt}`);
          if (oldSessionId) await redis.del(`${SESSION_PREFIX}${oldSessionId}`);
          await redis.del(`${REFRESH_PREFIX}${oldRt}`);
        }
        await redis.zRem(userRefreshKey, oldTokens);
      }

      // 写入新的 refresh token
      await redis.set(`${REFRESH_PREFIX}${refreshToken}`, sessionId, {
        EX: REFRESH_TOKEN_TTL
      });
      // 记录到用户的 refresh 索引（score = 当前时间戳）
      await redis.zAdd(userRefreshKey, { score: Date.now(), value: refreshToken });
      await redis.expire(userRefreshKey, REFRESH_TOKEN_TTL);
    }
  }

  // 5. DB 写入
  const { UserSession, SessionToken, SessionLog } = sequelize.models;

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
  await SessionToken.create({
    user_id: userId,
    app_id: appId,
    device_id: deviceId,
    token: tokenHash,
    ip,
    user_agent: userAgent,
    last_active: new Date()
  });

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

  return sessionId;
}

/**
 * 从请求中验证并获取会话数据
 * @param {object} params
 * @param {object} params.redis Redis 客户端
 * @param {object} params.cookies 请求的 cookies
 * @returns {object|null} 会话数据或 null
 */
export async function getSession(params) {
  const { redis, cookies, reply } = params;

  // 1. 解析 sid cookie
  const sidCookie = cookies[COOKIE_SID];
  if (!sidCookie) return null;

  const parsed = verifyCookie(sidCookie);
  if (!parsed) return null;

  const { sessionId, accessCount } = parsed;

  // 2. 递增访问次数，重新签名 cookie
  if (reply) {
    const newSidValue = signCookie(sessionId, accessCount + 1);
    const isRememberMe = cookies[COOKIE_SID_R] ? true : false;
    reply.setCookie(COOKIE_SID, newSidValue, {
      ...COOKIE_OPTIONS.SID,
      maxAge: isRememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL
    });
  }

  // 3. Redis 查询
  if (redis) {
    const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
    if (raw) {
      const data = JSON.parse(raw);
      // 续期
      const ttl = data.rememberMe ? LONG_SESSION_TTL : SHORT_SESSION_TTL;
      await redis.expire(`${SESSION_PREFIX}${sessionId}`, ttl);
      return { ...data, sessionId, accessCount: accessCount + 1 };
    }
  }

  // 4. Redis 未命中，降级到 DB
  const tokenHash = crypto.createHash('sha256').update(sessionId).digest('hex');
  const { SessionToken, User } = sequelize.models;

  const token = await SessionToken.findOne({
    where: { token: tokenHash, revoked: false },
    include: [{ model: User, as: 'user', required: true }]
  });

  if (!token) return null;

  // 4. 重建 Redis 缓存
  const user = token.user;
  const { roles, permissions } = await loadUserPermissions(
    user.id,
    token.app_id
  );

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
    userAgent: token.user_agent,
    loginAt: Math.floor(token.createdAt.getTime() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: false
  };

  if (redis) {
    await redis.set(
      `${SESSION_PREFIX}${sessionId}`,
      JSON.stringify(sessionData),
      { EX: SHORT_SESSION_TTL }
    );
  }

  return { ...sessionData, sessionId };
}

/**
 * 刷新会话 (sid 过期时用 sid_r 自动续期)
 * @param {object} params
 * @param {object} params.redis Redis 客户端
 * @param {object} params.cookies 请求的 cookies
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 * @returns {object|null} 新的会话数据或 null
 */
export async function refreshSession(params) {
  const { redis, cookies, reply, request } = params;

  // 1. 解析 sid_r cookie
  const sidRCookie = cookies[COOKIE_SID_R];
  if (!sidRCookie) return null;

  const parsed = verifyCookie(sidRCookie);
  if (!parsed) return null;

  const refreshToken = parsed.sessionId; // sid_r cookie 中存储的 payload 是 refreshToken

  // 2. Redis 查询 refreshToken 对应的旧 sessionId
  let oldSessionId = null;
  if (redis) {
    oldSessionId = await redis.get(`${REFRESH_PREFIX}${refreshToken}`);
  }

  // 3. DB 查询会话记录（createSession 存储的是 sha256(sessionId)）
  const { SessionToken } = sequelize.models;
  let record = null;

  if (oldSessionId) {
    // 优先用 Redis 中的 oldSessionId 精确查找
    const oldHash = crypto
      .createHash('sha256')
      .update(oldSessionId)
      .digest('hex');
    record = await SessionToken.findOne({
      where: { token: oldHash, revoked: false }
    });
  }

  // Redis 未命中时，降级用 refreshToken 哈希查找（兼容旧数据）
  if (!record) {
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    record = await SessionToken.findOne({
      where: { token: refreshTokenHash, revoked: false }
    });
  }

  if (!record) return null;

  // 4. 加载用户信息和权限
  const { User } = sequelize.models;
  const user = await User.findByPk(record.user_id);
  if (!user) return null;

  const { roles, permissions } = await loadUserPermissions(
    user.id,
    record.app_id
  );

  // 5. 生成新 sessionId
  const newSessionId = crypto.randomBytes(32).toString('hex');
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
    loginAt: Math.floor(record.createdAt.getTime() / 1000),
    lastActiveAt: Math.floor(Date.now() / 1000),
    rememberMe: true
  };

  // 6. Redis 写入新 session
  if (redis) {
    await redis.set(
      `${SESSION_PREFIX}${newSessionId}`,
      JSON.stringify(sessionData),
      { EX: sessionTtl }
    );
    // 更新 refreshToken 映射
    await redis.set(`${REFRESH_PREFIX}${refreshToken}`, newSessionId, {
      EX: REFRESH_TOKEN_TTL
    });
    // 更新 refresh token 的活跃时间
    const userRefreshKey = `user_refresh:${user.id}`;
    await redis.zAdd(userRefreshKey, { score: Date.now(), value: refreshToken });
    await redis.expire(userRefreshKey, REFRESH_TOKEN_TTL);
    // 清除旧 session
    if (oldSessionId) {
      await redis.del(`${SESSION_PREFIX}${oldSessionId}`);
    }
  }

  // 7. DB 更新 token 哈希
  const newTokenHash = crypto
    .createHash('sha256')
    .update(newSessionId)
    .digest('hex');
  await record.update({ token: newTokenHash, last_active: new Date() });

  // 8. 记录刷新日志（关联用户，操作留痕）
  const { SessionLog } = sequelize.models;
  await SessionLog.create({
    user_id: record.user_id,
    event: 'SESSION_REFRESH',
    app_id: record.app_id,
    ip: record.ip,
    user_agent: record.user_agent,
    details: {
      oldSessionId: oldSessionId || '-',
      newSessionId,
      reason: 'cookie_expired_auto_refresh'
    }
  });

  // 9. 下发新 sid cookie（刷新时 accessCount 清零）
  const sidValue = signCookie(newSessionId, 0);
  reply.setCookie(COOKIE_SID, sidValue, {
    ...COOKIE_OPTIONS.SID,
    maxAge: sessionTtl
  });

  return { ...sessionData, sessionId: newSessionId };
}

/**
 * 销毁会话 (登出)
 * @param {object} params
 * @param {object} params.redis Redis 客户端
 * @param {string} params.sessionId 会话 ID
 * @param {number} params.userId 用户 ID (用于日志)
 * @param {string} params.appId 应用 ID (用于日志)
 * @param {string} params.ip 客户端 IP
 * @param {import('fastify').FastifyReply} params.reply Fastify Reply 对象
 */
export async function destroySession(params) {
  const { redis, sessionId, userId, appId, ip, reply } = params;

  // 1. Redis 删除
  if (redis && sessionId) {
    await redis.del(`${SESSION_PREFIX}${sessionId}`);
  }

  // 2. DB 标记 revoked
  if (sessionId) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionId)
      .digest('hex');
    const { SessionToken } = sequelize.models;
    await SessionToken.update(
      { revoked: true },
      { where: { token: tokenHash } }
    );
  }

  // 3. 记录日志
  const { SessionLog } = sequelize.models;
  await SessionLog.create({
    user_id: userId,
    event: 'LOGOUT',
    app_id: appId,
    ip
  });

  // 4. 清除 Cookie
  reply.clearCookie(COOKIE_SID, { path: '/' });
  reply.clearCookie(COOKIE_SID_R, { path: '/' });
}

/**
 * 踢用户下线 (管理员操作)
 * @param {object} redis Redis 客户端
 * @param {number} userId 用户 ID
 * @param {string|null} appId 指定应用 (null = 全部应用)
 */
export async function kickUser(redis, userId, appId = null) {
  const { SessionToken, SessionLog } = sequelize.models;

  const where = { user_id: userId, revoked: false };
  if (appId) where.app_id = appId;

  const tokens = await SessionToken.findAll({ where });

  for (const token of tokens) {
    // 删除 Redis session
    if (redis) {
      await redis.del(`${SESSION_PREFIX}${token.token}`);
    }
    // 标记 revoked
    await token.update({ revoked: true });
  }

  // 记录日志
  await SessionLog.create({
    user_id: userId,
    event: 'KICK',
    app_id: appId || 'ALL',
    details: { kickedCount: tokens.length }
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
export async function logLoginFailure(params) {
  const { email, appId, ip, userAgent, reason, deviceType } = params;

  const { SessionLog } = sequelize.models;
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
 * @param {object} redis Redis 客户端
 * @returns {Promise<{onlineUsers: number, activeDevices: number, redisSessions: number}>}
 */
export async function getSessionStats(redis) {
  const { SessionToken, UserSession } = sequelize.models;

  // 1. 在线用户数（最近 15 分钟有活跃记录）
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const onlineUsers = await UserSession.count({
    where: { last_active_at: { [Op.gte]: fifteenMinutesAgo } }
  });

  // 2. 活跃设备数（未撤销的会话）
  const activeDevices = await SessionToken.count({
    where: { revoked: false }
  });

  // 3. Redis 中的活跃 session 数
  let redisSessions = 0;
  if (redis) {
    try {
      const keys = await redis.keys(`${SESSION_PREFIX}*`);
      redisSessions = keys.length;
    } catch {
      // Redis 故障时忽略
    }
  }

  return { onlineUsers, activeDevices, redisSessions };
}

/**
 * 获取登录趋势（最近 N 天的登录次数）
 * @param {number} days 天数（默认 7）
 * @returns {Promise<Array<{date: string, count: number}>>}
 */
export async function getLoginTrend(days = 7) {
  const { SessionLog } = sequelize.models;

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

  return logs.map((row) => ({
    date: row.date,
    count: parseInt(row.count, 10)
  }));
}
