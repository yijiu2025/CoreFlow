// src/loader/registry/02-redis.js
import { createClient } from 'redis';
import fp from 'fastify-plugin';

export default fp(async (app) => {
  if (process.env.REDIS_HOST) {
    const redis = createClient({
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`,
      socket: {
        reconnectStrategy: false // 禁用自动重连，如果连不上直接报错降级
      }
    });

    redis.on('error', (err) => console.warn('🚨 [Loader: Redis] 错误:', err.message));

    try {
      await redis.connect();
      console.log('✨ [Loader: Redis] Redis 连接成功');
      app.decorate('redis', redis);
    } catch (err) {
      console.warn('⚠️ [Loader: Redis] 无法连接到 Redis，后续功能将使用降级策略:', err.message);
      // 防止未注入导致后续 app.redis 报错
      app.decorate('redis', null);
    }
  } else {
    app.decorate('redis', null);
  }
});
