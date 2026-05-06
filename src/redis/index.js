/**
 * Redis 客户端初始化插件
 * 创建连接、注册健康监控、注入 app.redis / app.redisHealthy
 */
import { createClient } from 'redis';
import fp from 'fastify-plugin';
import { setupRedisHealthMonitor } from './health.js';

export default fp(async (app) => {
  if (process.env.REDIS_HOST) {
    const redis = createClient({
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: false // 禁用自动重连，连不上直接降级
      }
    });

    redis.on('error', (err) => console.warn('🚨 [Redis] 错误:', err.message));

    try {
      await redis.connect();
      console.log('✨ [Redis] 连接成功');
      app.decorate('redis', redis);
      setupRedisHealthMonitor(app, redis);
    } catch (err) {
      console.warn('⚠️ [Redis] 无法连接，降级策略:', err.message);
      app.decorate('redis', null);
    }
  } else {
    app.decorate('redis', null);
  }
});
