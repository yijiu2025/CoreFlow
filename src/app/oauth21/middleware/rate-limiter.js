/**
 * 敏感接口限频中间件
 *
 * 基于 IP 的速率限制，用于登录、注册、验证码等接口。
 * 使用 Redis Sorted Set 实现滑窗限频，Redis 不可用时降级到内存。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
const memoryStore = new Map();

/** 内存降级上限保护，防止 DoS 耗尽内存 */
const MEMORY_MAX = 100000;
/** 内存降级清理间隔（60 秒） */
const MEMORY_CLEANUP_INTERVAL = 60_000;

// 定期清理过期条目，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryStore) {
    if (v.expires < now) memoryStore.delete(k);
  }
  // 如果仍超过上限，淘汰一半最早过期条目
  if (memoryStore.size > MEMORY_MAX) {
    const toDelete = Math.floor(memoryStore.size / 2);
    const entries = [...memoryStore.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < toDelete; i++) {
      memoryStore.delete(entries[i][0]);
    }
  }
}, MEMORY_CLEANUP_INTERVAL).unref();

/**
 * 创建 IP 限频器
 * @param {object} redis - Redis 客户端
 * @param {string} prefix - 限频 key 前缀
 * @param {number} maxRequests - 窗口内最大请求数
 * @param {number} windowSec - 窗口时间（秒）
 */
function createIpRateLimiter(redis, prefix, maxRequests, windowSec) {
  return async function checkRateLimit(ip) {
    const key = `rl:${prefix}:${ip}`;
    const now = Date.now();
    const windowMs = windowSec * 1000;

    if (redis) {
      try {
        // 滑窗限频：移除窗口外的记录，计数窗口内的记录
        await redis.zRemRangeByScore(key, 0, now - windowMs);
        const count = await redis.zCard(key);

        if (count >= maxRequests) {
          const oldest = await redis.zRange(key, 0, 0, { REV: false });
          const retryAfter = oldest.length > 0 ? Math.ceil((parseInt(oldest[0]) + windowMs - now) / 1000) : windowSec;
          return { allowed: false, retryAfter };
        }

        await redis.zAdd(key, { score: now, value: `${now}` });
        await redis.expire(key, windowSec);
        return { allowed: true };
      } catch {
        // Redis 失败降级到内存
      }
    }

    // 内存降级
    let record = memoryStore.get(key);
    if (!record || record.expires < now) {
      record = { count: 0, expires: now + windowMs };
    }
    record.count++;
    memoryStore.set(key, record);

    if (record.count > maxRequests) {
      return { allowed: false, retryAfter: Math.ceil((record.expires - now) / 1000) };
    }
    return { allowed: true };
  };
}

/**
 * 注册敏感接口限频
 * @param {object} fastify - Fastify 实例
 * @param {object} redis - Redis 客户端
 */
function registerSensitiveRateLimits(fastify, redis) {
  // 登录接口：每 IP 每分钟 5 次
  const loginLimiter = createIpRateLimiter(redis, 'login', 5, 60);

  // 验证码接口：每 IP 每分钟 10 次
  const captchaLimiter = createIpRateLimiter(redis, 'captcha', 10, 60);

  // 注册接口：每 IP 每小时 3 次
  const registerLimiter = createIpRateLimiter(redis, 'register', 3, 3600);

  fastify.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    const ip = request.ip;

    let limiter = null;
    if (url.includes('/login') || url.includes('/mini-login')) {
      limiter = loginLimiter;
    } else if (url.includes('/generate-captcha') || url.includes('/verify-captcha')) {
      limiter = captchaLimiter;
    } else if (url.includes('/register')) {
      limiter = registerLimiter;
    }

    if (limiter) {
      const result = await limiter(ip);
      if (!result.allowed) {
        reply.header('Retry-After', result.retryAfter);
        return reply.code(429).send({
          code: 429,
          message: `请求过于频繁，请在 ${result.retryAfter} 秒后重试`,
          data: null
        });
      }
    }
  });
}

export { createIpRateLimiter, registerSensitiveRateLimits };
