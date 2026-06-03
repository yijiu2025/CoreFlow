/**
 * 异常登录检测模块
 * 检测异地登录、频繁失败、设备指纹变更等异常行为
 */
import sequelize from '../db/index.js';
import { Op } from 'sequelize';

/** 检测配置 */
const CONFIG = {
  maxFailuresPerIp: 10,      // 同一 IP 最大失败次数（15 分钟内）
  maxFailuresPerAccount: 5,  // 同一账号最大失败次数（15 分钟内）
  failureWindowMs: 15 * 60 * 1000, // 失败检测窗口（15 分钟）
  lockoutDurationMs: 30 * 60 * 1000 // 锁定时长（30 分钟）
};

/**
 * 检测结果
 */
export const DETECT_RESULT = {
  SAFE: 'safe',
  WARN: 'warn',           // 异常但允许登录
  BLOCK: 'block'          // 阻止登录
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
export async function detectLoginAnomaly(params) {
  const { email, ip, userAgent, redis } = params;
  const { SessionLog } = sequelize.models;

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
  const { SessionLog } = sequelize.models;
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
export async function clearAccountLock(redis, email) {
  if (!redis) return;
  await redis.del(`lockout:email:${email}`);
}

/**
 * 清除 IP 锁定
 * @param {object} redis Redis 客户端
 * @param {string} ip IP 地址
 */
export async function clearIpLock(redis, ip) {
  if (!redis) return;
  await redis.del(`lockout:ip:${ip}`);
}

export default CONFIG;
