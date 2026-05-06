/**
 * 防火墙工具函数集
 */
/**
 * 安全地执行 Redis 操作，并在出错时提供回退机制。
 * @param {import('ioredis').Redis} redis Redis 客户端
 * @param {Function} fn 执行函数
 * @param {any} fallback 出错或 Redis 不可用时的回退值
 * @returns {Promise<any>} 执行结果
 */
export async function safeRedis(redis, fn, fallback = null) {
  if (!redis) return fallback;
  try {
    return await fn(redis);
  } catch (err) {
    console.error('[Firewall] Redis 操作失败:', err.message);
    return fallback;
  }
}
