/**
 * Redis 模块共享工具函数
 *
 * 提取各 store 中重复的公共逻辑，统一维护。
 *
 * @author yijiu2025
 * @since 2026-07-28
 */

import { RedisRequiredError } from './errors.js';
import { globalRedis, backupRedis } from './plugin.js';

/**
 * 带超时的 Promise 操作
 * 超时时抛 Error（code: 'TIMEOUT'），调用方可通过 err.code === 'TIMEOUT' 判断
 * @param {Promise} promise - 原始 Promise
 * @param {number} [ms=5000] - 超时毫秒
 * @returns {Promise<any>} 原始 Promise 的返回值，超时则 reject
 */
function withTimeout(promise, ms = 5000) {
  // 【为什么不用 result.finally(cb)】finally 会派生出一个**被丢弃的** promise：
  // 主 promise 一旦 reject，这个孤儿 promise 也以同一理由 reject，而它没有任何
  // 处理者 —— 在 Node 默认的 --unhandled-rejections=throw 下会直接终止进程。
  // 表现是「Redis 一次普通的命令错误（如对 hash 键 GET 的 WRONGTYPE）升级成整个服务崩溃」，
  // 且崩溃栈指向 node-redis 解码器，极难定位。改用 then(onOk, onErr) 收尾：
  // 派生的 promise 两个分支都不抛，恒为 fulfilled，因此不会产生未处理拒绝。
  const delay = Number(ms);
  const effective = Number.isFinite(delay) && delay > 0 ? delay : 5000;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Redis 操作超时'), { code: 'TIMEOUT' })), effective);
  });

  const result = Promise.race([promise, timeout]);
  result.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer)
  );
  return result;
}

/**
 * 构建 Redis key：prefix:key
 * prefix 为空时直接返回 key（不加冒号）
 * @param {string} prefix - 命名空间
 * @param {string} key - 原始键名
 * @returns {string} 完整 Redis key
 */
function makeKey(prefix, key) {
  return prefix ? `${prefix}:${key}` : key;
}

/**
 * 获取主 Redis 连接，不可用时抛错
 * @returns {import('redis').RedisClientType}
 * @throws {RedisRequiredError} 主 Redis 未连接或不可用时
 */
function getRedisClient() {
  if (!globalRedis || !globalRedis.isReady) {
    throw new RedisRequiredError('主 Redis 不可用', { operation: 'redis' });
  }
  return globalRedis;
}

/**
 * 获取备用 Redis 连接，不可用时抛错
 * @returns {import('redis').RedisClientType}
 * @throws {RedisRequiredError} 备用 Redis 未连接或不可用时
 */
function getBackupRedisClient() {
  if (!backupRedis || !backupRedis.isReady) {
    throw new RedisRequiredError('备用 Redis 不可用', { operation: 'backupRedis' });
  }
  return backupRedis;
}

/**
 * 判断主 Redis 是否已配置（根据环境变量，不检查连接状态）
 * @returns {boolean} REDIS_ENABLED=true 且 REDIS_HOST 已设置
 */
function isRedisConfigured() {
  return process.env.REDIS_ENABLED === 'true' && !!process.env.REDIS_HOST;
}

/**
 * 判断备用 Redis 是否已配置（根据环境变量，不检查连接状态）
 * @returns {boolean} REDIS_ENABLED=true 且 REDIS_BACKUP_HOST 已设置
 */
function isBackupRedisConfigured() {
  return process.env.REDIS_ENABLED === 'true' && !!process.env.REDIS_BACKUP_HOST;
}

/**
 * 判断主 Redis 是否可用（已配置 + 已连接）
 * @returns {boolean}
 */
function isRedisReady() {
  return isRedisConfigured() && !!globalRedis && globalRedis.isReady;
}

/**
 * 判断备用 Redis 是否可用（已配置 + 已连接）
 * @returns {boolean}
 */
function isBackupRedisReady() {
  return isBackupRedisConfigured() && !!backupRedis && backupRedis.isReady;
}

/**
 * 安全 JSON 解析：合法 JSON 正常解析，非法 JSON 返回原始字符串
 * null/undefined 直接返回 null
 * @param {string|null} raw - 原始字符串
 * @returns {any} 解析后的值，解析失败返回原始字符串
 */
function safeParse(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * 序列化：非对象类型直接存，对象 JSON.stringify
 * null 直接返回 null
 * @param {any} value - 要序列化的值
 * @returns {any} 序列化后的值
 */
function serialize(value) {
  if (value === null || typeof value !== 'object') return value;
  return JSON.stringify(value);
}

export {
  withTimeout,
  makeKey,
  getRedisClient,
  getBackupRedisClient,
  isRedisConfigured,
  isBackupRedisConfigured,
  isRedisReady,
  isBackupRedisReady,
  safeParse,
  serialize
};
