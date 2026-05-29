/* eslint-disable no-console */
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

const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

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

    if (!enabled) {
      console.log(`ℹ️ [Redis] ${C.cyan}REDIS_ENABLED 未开启，跳过连接，使用内存降级模式${C.reset}`);
      app.decorate('redis', null);
      app.redisHealthy = false;
      return;
    }

    if (!process.env.REDIS_HOST) {
      console.log(`ℹ️ [Redis] ${C.cyan}REDIS_HOST 未配置，跳过连接，使用内存降级模式${C.reset}`);
      app.decorate('redis', null);
      app.redisHealthy = false;
      return;
    }

    const useTls = process.env.REDIS_TLS === 'true';
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT || 6379;

    const redis = createClient({
      url: buildRedisUrl(process.env),
      socket: {
        tls: useTls,
        rejectUnauthorized: useTls,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.warn(`⚠️ [Redis] ${C.yellow}重连次数超限（10次），停止重连${C.reset}`);
            return new Error('Redis max retries exceeded');
          }
          const delay = Math.min(3000 * Math.pow(2, retries), 30_000);
          console.warn(`⚠️ [Redis] ${C.yellow}第 ${retries + 1} 次重连，${delay / 1000}秒后重试...${C.reset}`);
          return delay;
        }
      }
    });

    redis.on('error', (err) => {
      console.warn(`⚠️ [Redis] ${C.yellow}连接错误: ${err.message}${C.reset}`);
    });

    try {
      await redis.connect();
      console.log(`✅ [Redis] ${C.green}连接成功: ${host}:${port}${C.reset}`);

      globalRedis = redis;
      app.decorate('redis', redis);
      setupRedisHealthMonitor(app, redis);

      app.addHook('onClose', async () => {
        try {
          await redis.quit();
        } catch {
          // 连接已断开时 quit 会抛错，安全忽略
        }
        globalRedis = null;
      });
    } catch (err) {
      console.warn(`❌ [Redis] ${C.red}连接失败 ${host}:${port}，降级到内存模式: ${err.message}${C.reset}`);
      globalRedis = null;
      app.decorate('redis', null);
      app.redisHealthy = false;
    }
  },
  { name: 'redis-plugin' }
);
