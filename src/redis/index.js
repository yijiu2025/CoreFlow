/**
 * Redis 客户端初始化插件
 * 创建连接、注册健康监控、注入 app.redis / app.redisHealthy
 *
 * 环境变量：
 *   REDIS_ENABLED  - 是否启用 Redis（true/false），默认 false
 *   REDIS_HOST     - Redis 主机地址
 *   REDIS_PORT     - Redis 端口，默认 6379
 *   REDIS_PASSWORD  - Redis 密码（可选）
 *   REDIS_TLS      - 是否启用 TLS（true/false），默认 false
 */
import { createClient } from 'redis';
import fp from 'fastify-plugin';
import { setupRedisHealthMonitor } from './health.js';

/** 全局 Redis 客户端引用（向后兼容，推荐使用 app.redis） */
export let globalRedis = null;

/**
 * 构建 Redis 连接 URL
 * @param {object} env 环境变量对象
 * @returns {string} Redis 连接 URL
 */
function buildRedisUrl(env) {
  const host = env.REDIS_HOST || '127.0.0.1';
  const port = env.REDIS_PORT || 6379;
  const password = env.REDIS_PASSWORD;

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

export default fp(
  async (app) => {
    const enabled = process.env.REDIS_ENABLED === 'true';

    if (!enabled || !process.env.REDIS_HOST) {
      app.decorate('redis', null);
      app.redisHealthy = false;
      return;
    }

    const useTls = process.env.REDIS_TLS === 'true';

    const redis = createClient({
      url: buildRedisUrl(process.env),
      socket: {
        tls: useTls,
        rejectUnauthorized: useTls,
        // 指数退避重连：初始 3 秒，最大 30 秒，最多重试 10 次后降级
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis max retries exceeded');
          }
          return Math.min(3000 * Math.pow(2, retries), 30_000);
        }
      }
    });

    redis.on('error', (err) => {
      console.warn('[Redis] 错误:', err.message);
    });

    try {
      await redis.connect();

      globalRedis = redis;
      app.decorate('redis', redis);
      setupRedisHealthMonitor(app, redis);

      // 优雅退出：关闭连接，等待未完成命令
      app.addHook('onClose', async () => {
        try {
          await redis.quit();
        } catch {
          // 连接已断开时 quit 会抛错，安全忽略
        }
        globalRedis = null;
      });
    } catch (err) {
      console.warn('[Redis] 无法连接，降级策略:', err.message);
      globalRedis = null;
      app.decorate('redis', null);
      app.redisHealthy = false;
    }
  },
  { name: 'redis-plugin' }
);
