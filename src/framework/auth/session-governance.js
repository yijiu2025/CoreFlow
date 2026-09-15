/**
 * Session 治理 / 统计（framework/auth 会话子模块）
 *
 * 由 session.js 拆分而来（AUDIT-REPORT-2026-09-12.md §2.3 批次 C）。
 * 收录**既不新建会话、也不踢出现有会话**的旁路操作：
 * - 容量治理：`pruneActiveDevices`（裁剪 x-device-id 客户端可控导致的活跃设备膨胀）、
 *   `pruneStaleSessionTokens`（清理 revoked 且超保留期的孤儿行）
 * - 配额检查：`checkMaxSessions`（并发会话数，顺带回收已过期 DB 行）
 * - 运维观测：`getSessionStats` / `getLoginTrend`
 * - 审计留痕：`logLoginFailure`（登录失败，通常无 userId）
 *
 * 依赖方向：只依赖 `./session-store.js` / `./cookie.js` / `./device.js` / db，
 * 不 import session.js 或 session-kick.js。
 *
 * 日志 tag 沿用 `framework.auth.session`（纯代码组织拆分，不改变日志行为）。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */

import { Op } from 'sequelize';
import sequelize from '../db/index.js';
import { getModel } from '../db/index.js';
import { LONG_SESSION_TTL } from './cookie.js';
import { DEVICE_TYPE } from './device.js';
import { sessionStore, userSessionsStore, MAX_ACTIVE_DEVICES } from './session-store.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.session');

// ── 治理 / 统计 ──

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
    log.debug('🔍 [session] 回收 %s 条过期会话: userId=%s, appId=%s', expiredCount[0], userId, appId);
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

  // 只数活跃行（revoked=false），超过上限才清（等于上限不裁——本函数在新增设备行
  // 之后调用，count 已含新设备，activeCount > MAX 才代表"旧设备 + 新设备"超限）
  const activeCount = await SessionToken.count({ where: { user_id: userId, revoked: false } });
  if (activeCount <= MAX_ACTIVE_DEVICES) return 0;

  const removeCount = activeCount - MAX_ACTIVE_DEVICES;
  // 按 last_active 升序取最旧的 removeCount 条活跃行
  const oldest = await SessionToken.findAll({
    where: { user_id: userId, revoked: false },
    order: [['last_active', 'ASC']],
    limit: removeCount,
    attributes: ['id']
  });
  if (!oldest.length) return 0;

  // 批量硬删除：SessionToken 无 delete_version/paranoid（撤销语义由 revoked 字段表达），
  // destroy 即物理 DELETE。被裁剪的都是 last_active 最旧的设备行，设备下次访问会重新 upsert。
  const destroyed = await SessionToken.destroy({
    where: { id: oldest.map(r => r.id) }
  });
  log.debug(
    '🧹 [session] 裁剪活跃设备: userId=%s, 删除 %s 行 (原 %s, 上限 %s)',
    userId,
    destroyed,
    activeCount,
    MAX_ACTIVE_DEVICES
  );
  return destroyed;
}

/**
 * 清理 session_tokens 表的陈旧孤儿行
 *
 * 治理 device_id 重生/变更后的孤儿数据：
 * - verifyAndNormalizeDeviceId 对超 365 天的老格式 ID 重生 → 旧 device_id 的行变孤儿
 * - updateSessionBaseline 变更 device_id 后，理论上旧行已更新不 orphan，但历史脏数据可能残留
 * - checkMaxSessions 已把超 30 天的标 revoked=true（保留审计），本函数只删 revoked 且再超
 *   STALE_TOKEN_RETENTION 天的行，既防膨胀又留够审计窗口
 *
 * 硬删（SessionToken 无 paranoid）。返回删除行数。
 *
 * @param {number} [retentionDays=90] revoked 后保留天数
 * @returns {Promise<number>} 删除的行数
 */
async function pruneStaleSessionTokens(retentionDays = 90) {
  const SessionToken = getModel('SessionToken');
  if (!SessionToken) return 0;

  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  // 删：已 revoked 且 last_active 早于阈值（即 revoked 超过 retentionDays 的）
  // last_active 在 revoked 时不再更新，故以它为 revoked 时间近似
  const destroyed = await SessionToken.destroy({
    where: {
      revoked: true,
      last_active: { [Op.lt]: threshold }
    }
  });
  if (destroyed > 0) {
    log.debug('🧹 [session] 清理陈旧 session_tokens: 删除 %s 行 (revoked 且超 %s 天)', destroyed, retentionDays);
  }
  return destroyed;
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
  // Redis 故障时降级为 0，但**必须留痕**：否则运维看板上 redisSessions 恒为 0 时
  // 无法区分「真的没有会话」与「Redis 挂了」，排障方向会被带偏（AUDIT-REPORT 🟡-4）。
  let redisSessions = 0;
  try {
    redisSessions = await sessionStore.size();
  } catch (err) {
    log.warn('[Session] sessionStore.size() 失败，redisSessions 降级为 0:', err);
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

export {
  checkMaxSessions,
  pruneActiveDevices,
  pruneStaleSessionTokens,
  getSessionStats,
  getLoginTrend,
  logLoginFailure
};
