/**
 * 异常登录检测模块
 * 检测异地登录、频繁失败、设备指纹变更等异常行为
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getModel } from '../db/index.js';
import { Op } from 'sequelize';
import { getStore } from '../redis/index.js';

/** 检测配置 */
const CONFIG = {
  maxFailuresPerIp: 10, // 同一 IP 最大失败次数（15 分钟内）
  maxFailuresPerAccount: 5, // 同一账号最大失败次数（15 分钟内）
  failureWindowMs: 15 * 60 * 1000, // 失败检测窗口（15 分钟）
  lockoutDurationMs: 30 * 60 * 1000 // 锁定时长（30 分钟）
};

/**
 * 检测结果
 */
const DETECT_RESULT = {
  SAFE: 'safe',
  WARN: 'warn', // 异常但允许登录
  BLOCK: 'block' // 阻止登录
};

/**
 * 检测登录异常
 * @param {object} params
 * @param {string} params.email 登录邮箱
 * @param {string} params.ip 客户端 IP
 * @param {string} params.userAgent User-Agent
 * @param {object} [params.redis] Redis 客户端
 * @returns {Promise<{status: string, reason?: string}>}
 */
async function detectLoginAnomaly(params) {
  const { email, ip, redis } = params;

  // 1. 检查同一 IP 的失败次数
  const ipFailures = await countRecentFailures(null, ip);
  if (ipFailures >= CONFIG.maxFailuresPerIp) {
    // 检查是否在锁定期内
    if (redis) {
      const lockKey = `lockout:ip:${ip}`;
      const locked = await redis.get(lockKey);
      if (locked) {
        return { status: DETECT_RESULT.BLOCK, reason: 'IP 登录失败次数过多，已被临时锁定' };
      }
    }
    // 超过阈值但未锁定，记录警告
    return { status: DETECT_RESULT.WARN, reason: `IP ${ip} 登录失败次数异常 (${ipFailures}次)` };
  }

  // 2. 检查同一账号的失败次数
  const accountFailures = await countRecentFailures(email, null);
  if (accountFailures >= CONFIG.maxFailuresPerAccount) {
    // 锁定账号
    if (redis) {
      const lockKey = `lockout:email:${email}`;
      await redis.set(lockKey, '1', { EX: Math.floor(CONFIG.lockoutDurationMs / 1000) });
    }
    return { status: DETECT_RESULT.BLOCK, reason: `账号 ${email} 登录失败次数过多，已被锁定 30 分钟` };
  }

  // 3. 检查是否在锁定期内
  if (redis) {
    const emailLocked = await redis.get(`lockout:email:${email}`);
    if (emailLocked) {
      return { status: DETECT_RESULT.BLOCK, reason: '账号已被锁定，请稍后再试' };
    }
  }

  return { status: DETECT_RESULT.SAFE };
}

/**
 * 统计最近失败次数
 * @param {string|null] email 邮箱（可选）
 * @param {string|null] ip IP 地址（可选）
 * @returns {Promise<number>}
 */
async function countRecentFailures(email, ip) {
  const SessionLog = getModel('SessionLog');
  const since = new Date(Date.now() - CONFIG.failureWindowMs);

  const where = {
    event: 'LOGIN_FAILED',
    created_at: { [Op.gte]: since }
  };

  if (email) {
    where.details = { email };
  } else if (ip) {
    where.ip = ip;
  } else {
    return 0;
  }

  return await SessionLog.count({ where });
}

/**
 * 清除账号锁定
 * @param {object} redis Redis 客户端
 * @param {string} email 邮箱
 */
async function clearAccountLock(redis, email) {
  if (!redis) return;
  await redis.del(`lockout:email:${email}`);
}

/**
 * 清除 IP 锁定
 * @param {object} redis Redis 客户端
 * @param {string} ip IP 地址
 */
async function clearIpLock(redis, ip) {
  if (!redis) return;
  await redis.del(`lockout:ip:${ip}`);
}

/** 已验证标记 TTL：通过人机验证后 30 分钟内不再弹（避免频繁打扰） */
const VERIFIED_TTL = 30 * 60; // 秒
/** 验证标记 Redis store（缓存实例避免重复创建） */
let _verifyStore = null;
function getVerifyStore() {
  if (_verifyStore) return _verifyStore;
  _verifyStore = getStore('safe_verify', { timeout: 3000 });
  return _verifyStore;
}

/**
 * 访问时的会话风险检测（纯内存/Redis 比对，不查 DB）
 *
 * 基准从 Redis session 数据里取（登录时 createSession 写入 deviceFingerprint + ip），
 * 避免每次请求查 session_tokens 表。访问时 getSession 已拿到 sessionData，直接传基准进来。
 *
 * 风险规则（IP+指纹组合判，防止误杀梯子用户）：
 * - 指纹变（无论 IP 变不变）→ warn：触发人机验证，高风险操作拒
 * - IP 变但指纹不变 → info：可能是梯子，不拦不弹，仅记录（供审计）
 * - 基准缺失 → info：旧 session 无指纹字段（登录早于该功能上线），降级放行不误判
 * - 都没变 → safe
 *
 * 已通过验证（Redis 有 verified 标记）→ 直接 safe，不重复弹
 *
 * @param {object} params
 * @param {number} params.userId - user_user.id
 * @param {string} params.deviceId - 当前请求的 device_id（cookie/头）
 * @param {string} params.ip - 当前请求 IP
 * @param {string} [params.fingerprint] - 当前请求算出的复合指纹
 * @param {string} [params.baselineFingerprint] - 基准指纹（sessionData.deviceFingerprint）
 * @param {string} [params.baselineIp] - 基准 IP（sessionData.ip）
 * @param {string} [params.verifyUrl] - 前端验证端点（返回给前端弹框用）
 * @returns {Promise<{level: string, reasons: string[], verify?: object}>} level: safe|info|warn
 */
async function detectSessionRisk({ userId, deviceId, ip, fingerprint, baselineFingerprint, baselineIp, verifyUrl }) {
  const reasons = [];
  if (!userId || !deviceId) {
    return { level: 'info', reasons: ['missing_user_or_device'] };
  }

  // 1. 先查已验证标记：通过过人机验证则直接放行，不重复弹
  try {
    const store = getVerifyStore();
    const verified = await store.get(`verified:${userId}:${deviceId}`);
    if (verified) return { level: 'safe', reasons: ['already_verified'] };
  } catch {
    // 标记查询失败不阻塞，继续走检测
  }

  // 2. 基准缺失（旧 session 无指纹字段）→ 降级 info 放行，不误判
  if (!baselineFingerprint) {
    return { level: 'info', reasons: ['no_baseline'] };
  }

  const fpChanged = !!(fingerprint && baselineFingerprint !== fingerprint);
  const ipChanged = !!(baselineIp && ip && baselineIp !== ip);

  // 3. 组合判定
  if (fpChanged) {
    reasons.push('fingerprint_changed');
    if (ipChanged) reasons.push('ip_changed');
    return {
      level: 'warn',
      reasons,
      verify: {
        url: verifyUrl || '/auth/v1/verify-challenge',
        header: 'x-verify-token',
        // 验证 token：userId+deviceId+nonce 存 Redis，验证端点校验一致性
        token: await issueVerifyToken(userId, deviceId)
      }
    };
  }

  // IP 变但指纹不变：梯子可能性大，不拦
  if (ipChanged) {
    reasons.push('ip_changed');
    return { level: 'info', reasons };
  }

  return { level: 'safe', reasons };
}

/**
 * 签发验证 token（前端放进 x-verify-token 头调验证端点）
 * 简化：用 userId+deviceId+nonce 存 Redis，验证端点比对
 */
async function issueVerifyToken(userId, deviceId) {
  const token = `${userId}.${deviceId}.${Math.random().toString(36).slice(2)}`;
  try {
    const store = getVerifyStore();
    await store.set(`vtoken:${token}`, { userId, deviceId }, VERIFIED_TTL);
  } catch {
    /* 存失败则验证端点无法校验，但不影响本次返回 */
  }
  return token;
}

/**
 * 验证端点调用：校验 verify token 一致后，写"已验证"标记（30 分钟免验）
 * @param {string} token - 前端传来的 x-verify-token
 * @returns {Promise<boolean>} 是否验证成功
 */
async function confirmVerifyToken(token) {
  try {
    const store = getVerifyStore();
    const data = await store.get(`vtoken:${token}`);
    if (!data) return false;
    // 写已验证标记
    await store.set(`verified:${data.userId}:${data.deviceId}`, { at: Date.now() }, VERIFIED_TTL);
    // 验证 token 一次性，消费掉
    await store.delete(`vtoken:${token}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判断请求是否高风险操作（触发验证拦截的）
 * 默认：非 GET/HEAD/OPTIONS 方法即视为高风险（写操作）
 */
function isHighRiskRequest(request) {
  const m = (request?.method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(m);
}

export {
  DETECT_RESULT,
  detectLoginAnomaly,
  detectSessionRisk,
  confirmVerifyToken,
  isHighRiskRequest,
  clearAccountLock,
  clearIpLock
};
export default CONFIG;
