/**
 * 安全审计日志
 *
 * 记录关键安全事件：登录/登出/权限变更/密码修改/踢出设备
 * 写入数据库（持久化）+ Redis 环形缓冲（最近 N 条快速查询）
 *
 * Redis 访问通过统一存储层（createRingQueue），不再收裸 redis 客户端参数——
 * 原实现 logAuditEvent(redis, event) 把 request.server.redis 一路传递，违反
 * "禁止直接操作原始 redis 客户端"铁律，且无超时保护、无命名空间、Redis 故障
 * 时静默跳过。createRingQueue 自带超时、命名空间、固定容量环形缓冲（满覆盖最旧），
 * Redis 故障时 try-catch 降级放行（DB 仍写入，审计不因 Redis 挂而中断业务）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-09 去掉 redis 传递链，改用 createRingQueue 统一存储层
 */

import { getModel } from '../../../persistence/db/index.js';
import { createRingQueue } from '../../../persistence/redis/index.js';
import Logger from '../../../support/log/index.js';
import { requestContext } from '../context/request-context.js';

/** 审计事件 Redis 环形缓冲命名空间 */
const AUDIT_PREFIX = 'audit:security';
/** 环形缓冲容量：只保留最近 N 条审计事件供快查（DB 是完整持久化源） */
const AUDIT_MAX_SIZE = 1000;
/** 设备码列宽（同 `AuditLog.device_id` STRING(100)）：超长截断，不让一条脏 UA 头打断审计 */
const DEVICE_ID_MAX = 100;

/**
 * 解析本条审计事件的设备标识
 *
 * 优先取会话里的 `deviceId`（登录时校验并规范化的结构化 ID，与风险检测同源），
 * 会话字段缺失时退回客户端自报的 header / cookie —— 覆盖"登录成功那一刻
 * `request.state.user` 还没写入"的场景。
 *
 * ⚠️ 这里记的是**事实**而不是判据：device_id 由客户端携带、可清除重生（见
 *    device-id-service.js 的强度说明），它的用途是"事后把同一台机器的操作串起来"，
 *    与 IP / User-Agent 同一强度，不能作为权限判断依据。
 *
 * 非请求上下文（定时任务、脚本、单元测试）返回 null，`event.deviceId` 显式传入时优先。
 *
 * @param {object} event 审计事件
 * @returns {string|null} 设备标识
 */
function resolveDeviceId(event) {
  if (event.deviceId) return String(event.deviceId).slice(0, DEVICE_ID_MAX);
  const request = requestContext.getStore();
  if (!request) return null;
  const fromSession = request.state?.user?.deviceId;
  if (fromSession) return String(fromSession).slice(0, DEVICE_ID_MAX);
  const raw = request.headers?.['x-device-id'] || request.cookies?.device_id || '';
  if (typeof raw !== 'string' || raw === '') return null;
  return raw.slice(0, DEVICE_ID_MAX);
}

/**
 * 审计事件环形缓冲（Redis 后端）
 *
 * createRingQueue 文档点名"适合日志缓冲、操作历史、事件记录等只保留最近 N 条的场景"，
 * 与审计快查副本语义完全对齐。固定 maxSize，满时自动覆盖最旧，无需每次 lTrim。
 * backend:'redis' 在 Redis 未配置/故障时构造抛错，故用 _ensureRing 惰性初始化 +
 * 失败降级为 null（后续写入静默跳过 Redis 副本，DB 仍写）。
 */
let _ring = null;
let _ringInitFailed = false;
function getAuditRing() {
  if (_ring) return _ring;
  if (_ringInitFailed) return null; // 避免每次写入都重复尝试构造
  try {
    _ring = createRingQueue(AUDIT_PREFIX, {
      maxSize: AUDIT_MAX_SIZE,
      backend: 'redis',
      timeout: 3000
    });
    return _ring;
  } catch (err) {
    _ringInitFailed = true;
    Logger.warn(`[Audit] 审计环形缓冲初始化失败，Redis 副本降级跳过: ${err?.message}`);
    return null;
  }
}

/**
 * 记录审计事件
 *
 * 双写：DB（持久化，完整审计源）+ Redis 环形缓冲（最近 N 条快查）。
 * Redis 故障/未配置时只写 DB，不阻塞调用方（审计是业务附属，不该雪崩业务）。
 *
 * @param {object} event - 事件对象（type/userId/ip/userAgent/appId/deviceId/details）
 *   `deviceId` 可省略：省略时自动从当前请求上下文取（会话 deviceId → 请求头/cookie）
 */
async function logAuditEvent(event) {
  const deviceId = resolveDeviceId(event);
  // 1. 写入数据库（持久化，审计完整数据源）
  try {
    const AuditLog = getModel('AuditLog');
    if (AuditLog) {
      await AuditLog.create({
        user_id: event.userId || null,
        event: event.type,
        app_id: event.appId || null,
        ip: event.ip || null,
        user_agent: event.userAgent || null,
        device_id: deviceId,
        details: event.details || null
      });
    }
  } catch (err) {
    Logger.warn(`[Audit] 数据库写入失败: ${err.message}`);
  }

  // 2. 写入 Redis 环形缓冲（最近 N 条快查副本）
  //    Redis 故障/未配置时跳过——DB 已是完整源，Redis 仅加速查询，丢失不致命
  const ring = getAuditRing();
  if (!ring) return;
  try {
    await ring.push({ ...event, deviceId, timestamp: new Date().toISOString() });
  } catch (err) {
    Logger.warn(`[Audit] Redis 副本写入失败，仅保留 DB 记录: ${err?.message}`);
  }
}

/**
 * 获取审计日志（从数据库）
 * @param {object} options - 查询选项
 * @param {number} options.limit - 返回条数
 * @param {string} options.event - 事件类型过滤
 * @param {number} options.userId - 用户 ID 过滤
 * @returns {Promise<object[]>}
 */
async function getAuditLogs(options = {}) {
  const AuditLog = getModel('AuditLog');
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
 * @param {object} params - { userId, ip, userAgent, appId, success, reason }
 */
async function logLogin({ userId, ip, userAgent, appId, success, reason }) {
  await logAuditEvent({
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
 * @param {object} params - { userId, ip, appId }
 */
async function logLogout({ userId, ip, appId }) {
  await logAuditEvent({
    type: 'LOGOUT',
    userId,
    ip,
    appId
  });
}

/**
 * 便捷方法：记录踢出设备事件
 * @param {object} params - { userId, ip, targetSessionId, reason }
 */
async function logKick({ userId, ip, targetSessionId, reason }) {
  await logAuditEvent({
    type: 'SESSION_KICK',
    userId,
    ip,
    details: { targetSessionId, reason }
  });
}

/**
 * 便捷方法：记录密码修改事件
 * @param {object} params - { userId, ip, userAgent }
 */
async function logPasswordChange({ userId, ip, userAgent }) {
  await logAuditEvent({
    type: 'PASSWORD_CHANGE',
    userId,
    ip,
    userAgent
  });
}

/**
 * 便捷方法：记录注册事件（成功/失败）
 * @param {object} params - { userId, email, ip, userAgent, appId, success, reason }
 */
async function logRegister({ userId, email, ip, userAgent, appId, success, reason }) {
  await logAuditEvent({
    type: success ? 'REGISTER_SUCCESS' : 'REGISTER_FAILED',
    userId,
    ip,
    userAgent,
    appId,
    // 邮箱脱敏记录（含 email 字段，sanitizeForLog 不覆盖 email，这里手动截断）
    details: { email: email ? `${email.slice(0, 2)}***@${email.split('@')[1] || ''}` : null, reason }
  });
}

export { logAuditEvent, getAuditLogs, logLogin, logLogout, logKick, logPasswordChange, logRegister };
