/**
 * 安全审计日志
 *
 * 记录关键安全事件：登录/登出/权限变更/密码修改/踢出设备
 * 写入数据库（持久化）+ Redis（快速查询最近日志）
 */

import sequelize from '../db/index.js';
import Logger from '../log/index.js';

const AUDIT_KEY = 'audit:security';
const MAX_REDIS_ENTRIES = 1000;

/**
 * 记录审计事件
 * @param {object} redis - Redis 客户端（可选）
 * @param {object} event - 事件对象
 */
export async function logAuditEvent(redis, event) {
  const { AuditLog } = sequelize.models;

  // 1. 写入数据库（持久化）
  if (AuditLog) {
    try {
      await AuditLog.create({
        user_id: event.userId || null,
        event: event.type,
        app_id: event.appId || null,
        ip: event.ip || null,
        user_agent: event.userAgent || null,
        details: event.details || null
      });
    } catch (err) {
      Logger.warn(`[Audit] 数据库写入失败: ${err.message}`);
    }
  }

  // 2. 写入 Redis（快速查询）
  if (redis) {
    try {
      const entry = { ...event, timestamp: new Date().toISOString() };
      await redis.lPush(AUDIT_KEY, JSON.stringify(entry));
      await redis.lTrim(AUDIT_KEY, 0, MAX_REDIS_ENTRIES - 1);
    } catch (err) {
      Logger.warn(`[Audit] Redis 写入失败: ${err.message}`);
    }
  }

  Logger.info(`[Audit] ${event.type}: userId=${event.userId}, ip=${event.ip}`);
}

/**
 * 获取审计日志（从数据库）
 * @param {object} options - 查询选项
 * @param {number} options.limit - 返回条数
 * @param {string} options.event - 事件类型过滤
 * @param {number} options.userId - 用户 ID 过滤
 * @returns {Promise<object[]>}
 */
export async function getAuditLogs(options = {}) {
  const { AuditLog } = sequelize.models;
  if (!AuditLog) return [];

  const { limit = 100, event: eventType, userId } = options;
  const where = {};
  if (eventType) where.event = eventType;
  if (userId) where.user_id = userId;

  return AuditLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: Math.min(limit, 500)
  });
}

/**
 * 便捷方法：记录登录事件
 */
export async function logLogin(redis, { userId, ip, userAgent, appId, success, reason }) {
  await logAuditEvent(redis, {
    type: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
    userId,
    ip,
    userAgent,
    appId,
    details: { reason }
  });
}

/**
 * 便捷方法：记录登出事件
 */
export async function logLogout(redis, { userId, ip, appId }) {
  await logAuditEvent(redis, {
    type: 'LOGOUT',
    userId,
    ip,
    appId
  });
}

/**
 * 便捷方法：记录踢出设备事件
 */
export async function logKick(redis, { userId, ip, targetSessionId, reason }) {
  await logAuditEvent(redis, {
    type: 'SESSION_KICK',
    userId,
    ip,
    details: { targetSessionId, reason }
  });
}

/**
 * 便捷方法：记录密码修改事件
 */
export async function logPasswordChange(redis, { userId, ip, userAgent }) {
  await logAuditEvent(redis, {
    type: 'PASSWORD_CHANGE',
    userId,
    ip,
    userAgent
  });
}
