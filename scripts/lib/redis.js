/**
 * Redis 工具模块
 * 封装 Redis 连接、信息查询和常用操作
 *
 * @module scripts/lib/redis
 * @example
 * import { connectRedis, closeRedis, getRedisInfo } from './lib/redis.js';
 * const redis = await connectRedis();
 * if (redis) {
 *   const info = await getRedisInfo(redis);
 *   await closeRedis(redis);
 * }
 */

// ============== 连接管理 ==============

/**
 * 创建 Redis 连接
 * @returns {Promise<import('redis').RedisClient|null>} Redis 客户端实例，未启用时返回 null
 */
export async function connectRedis() {
  if (process.env.REDIS_ENABLED !== 'true' || !process.env.REDIS_HOST) {
    return null;
  }

  try {
    const { createClient } = await import('redis');
    const client = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        connectTimeout: 5000,
        lazyConnect: true
      },
      password: process.env.REDIS_PASSWORD || undefined
    });

    await client.connect();
    return client;
  } catch {
    return null;
  }
}

/**
 * 关闭 Redis 连接
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @returns {Promise<void>}
 */
export async function closeRedis(client) {
  if (client) {
    try {
      await client.quit();
    } catch {
      // 忽略关闭错误
    }
  }
}

/**
 * 测试 Redis 连接
 * @returns {Promise<boolean>}
 */
export async function testRedisConnection() {
  const client = await connectRedis();
  if (!client) return false;

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    await closeRedis(client);
  }
}

// ============== 信息查询 ==============

/**
 * Redis 信息结构
 * @typedef {object} RedisInfo
 * @property {string|null} version - Redis 版本
 * @property {string|null} uptime - 运行时间（秒）
 * @property {string|null} connectedClients - 连接客户端数
 * @property {string|null} usedMemory - 已用内存
 * @property {string|null} usedMemoryPeak - 内存峰值
 * @property {number} totalKeys - 总键数
 */

/**
 * 获取 Redis 详细信息
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @returns {Promise<RedisInfo>}
 */
export async function getRedisInfo(client) {
  const [serverInfo, memoryInfo] = await Promise.all([
    client.info('server'),
    client.info('memory')
  ]);

  const [totalKeys] = await Promise.all([
    client.dbsize()
  ]);

  return {
    version: parseInfo(serverInfo, 'redis_version'),
    uptime: parseInfo(serverInfo, 'uptime_in_seconds'),
    connectedClients: parseInfo(serverInfo, 'connected_clients'),
    usedMemory: parseInfo(memoryInfo, 'used_memory_human'),
    usedMemoryPeak: parseInfo(memoryInfo, 'used_memory_peak_human'),
    totalKeys
  };
}

/**
 * 解析 Redis INFO 命令输出
 * @param {string} info - INFO 命令输出
 * @param {string} key - 要提取的键名
 * @returns {string|null}
 * @private
 */
function parseInfo(info, key) {
  const match = info.match(new RegExp(`${key}:(.+)`));
  return match ? match[1].trim() : null;
}

// ============== Key 操作 ==============

/**
 * 按模式匹配 keys
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @param {string} pattern - 匹配模式（如 'session:*'）
 * @returns {Promise<string[]>} 匹配的 key 数组
 */
export async function getKeysByPattern(client, pattern) {
  return await client.keys(pattern);
}

/**
 * 按模式清除 keys
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @param {string} pattern - 匹配模式
 * @returns {Promise<number>} 清除的 key 数量
 */
export async function clearKeysByPattern(client, pattern) {
  const keys = await client.keys(pattern);
  if (keys.length === 0) return 0;

  // 批量删除，每批 1000 个
  const batchSize = 1000;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    await client.del(batch);
  }

  return keys.length;
}

// ============== Session 操作 ==============

/**
 * 清除指定用户的 session
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @param {number} userId - 用户 ID
 * @param {string} uid - 用户 UUID
 * @returns {Promise<number>} 清除的 session 数量
 */
export async function clearUserSessions(client, userId, uid) {
  const keys = await client.keys('session:*');
  let cleared = 0;

  for (const key of keys) {
    const data = await client.get(key);
    if (data) {
      try {
        const session = JSON.parse(data);
        if (session.userId === userId || session.uid === uid) {
          await client.del(key);
          cleared++;
        }
      } catch {
        // 跳过非 JSON 格式的 key
      }
    }
  }

  return cleared;
}

/**
 * 获取 session 数量
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @returns {Promise<number>}
 */
export async function getSessionCount(client) {
  const keys = await client.keys('session:*');
  return keys.length;
}

/**
 * 获取指定 key 的 TTL
 * @param {import('redis').RedisClient} client - Redis 客户端实例
 * @param {string} key - key 名称
 * @returns {Promise<number>} TTL（秒），-1 表示永不过期，-2 表示不存在
 */
export async function getKeyTTL(client, key) {
  return await client.ttl(key);
}
