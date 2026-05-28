/**
 * Redis 安全操作包装器
 * 提供统一的错误处理与降级机制，防止 Redis 故障扩散到业务层
 */

/**
 * 安全地执行 Redis 操作，并在出错时提供回退机制。
 * @param {import('redis').RedisClientType} redis Redis 客户端（可为 null）
 * @param {Function} fn 执行函数，接收 redis 客户端作为参数
 * @param {any} fallback 出错或 Redis 不可用时的回退值
 * @returns {Promise<any>} 执行结果
 */
export async function safeRedis(redis, fn, fallback = null) {
  if (!redis) return fallback;
  try {
    return await fn(redis);
  } catch (err) {
    // 区分网络/连接错误与程序错误
    if (
      err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.name === 'AbortError' ||
      err.name === 'ClientClosedError'
    ) {
      console.warn('[Redis] 网络操作失败，降级:', err.message);
    } else {
      console.error('[Redis] 操作异常:', err.message);
    }
    return fallback;
  }
}
