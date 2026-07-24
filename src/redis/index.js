/**
 * Redis 客户端初始化插件
 * 创建连接、注册健康监控、注入 app.redis / app.redisHealthy
 * 支持多数据库连接：app.redisDb(1) 获取指定数据库的连接
 *
 * 环境变量：
 *   REDIS_ENABLED  - 是否启用 Redis（true/false），默认 false
 *   REDIS_HOST     - Redis 主机地址
 *   REDIS_PORT     - Redis 端口，默认 6379
 *   REDIS_PASSWORD  - Redis 密码（可选）
 *   REDIS_TLS      - 是否启用 TLS（true/false），默认 false
 *   REDIS_DB       - 默认数据库编号（0-15），默认 0
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

/* eslint-disable no-console */

import { createClient } from 'redis';
import fp from 'fastify-plugin';
import { setupRedisHealthMonitor } from './health.js';
import { C } from '../utils/colors.js';

/** 全局 Redis 客户端引用（向后兼容，推荐使用 app.redis） */
export let globalRedis = null;

/** 连接池：按数据库编号缓存连接实例 */
const _dbConnections = new Map();

/**
 * 降级到内存模式
 * 注入 null redis 实例，标记健康状态为 false
 */
function degrade(app, reason) {
  console.log(`ℹ️ [Redis] ${C.cyan}${reason}，使用内存降级模式${C.reset}`);
  globalRedis = null;
  app.decorate('redis', null);
  app.redisHealthy = false;
}

/**
 * 创建指定数据库的 Redis 连接
 * 使用与主连接相同的 host/port/password/tls 配置
 *
 * @param {object} opts - 连接配置
 * @param {string} opts.host - Redis 主机
 * @param {number|string} opts.port - Redis 端口
 * @param {boolean} opts.useTls - 是否启用 TLS
 * @param {number} [opts.db=0] - 数据库编号（0-15）
 * @returns {import('redis').RedisClientType}
 */
function createRedisConnection({ host, port, useTls, db = 0 }) {
  const client = createClient({
    socket: {
      host,
      port,
      tls: useTls,
      rejectUnauthorized: useTls,
      reconnectStrategy: retries => {
        if (retries > 10) {
          console.warn(`⚠️ [Redis] ${C.yellow}重连次数超限（10次），停止重连${C.reset}`);
          return new Error('Redis max retries exceeded');
        }
        const delay = Math.min(3000 * Math.pow(2, retries), 30_000);
        console.warn(`⚠️ [Redis] ${C.yellow}第 ${retries + 1} 次重连，${delay / 1000}秒后重试...${C.reset}`);
        return delay;
      }
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: db
  });

  client.on('error', err => {
    console.warn(`⚠️ [Redis] ${C.yellow}连接错误 [db${db}]: ${err.message}${C.reset}`);
  });

  return client;
}

export default fp(
  async app => {
    const enabled = process.env.REDIS_ENABLED === 'true';

    if (!enabled) {
      degrade(app, 'REDIS_ENABLED 未开启，跳过连接');
      return;
    }

    if (!process.env.REDIS_HOST) {
      degrade(app, 'REDIS_HOST 未配置，跳过连接');
      return;
    }

    const useTls = process.env.REDIS_TLS === 'true';
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT || 6379;
    const defaultDb = parseInt(process.env.REDIS_DB || '0', 10);

    // 创建默认数据库连接
    const redis = createRedisConnection({ host, port, useTls, db: defaultDb });

    redis.on('error', err => {
      console.warn(`⚠️ [Redis] ${C.yellow}连接错误: ${err.message}${C.reset}`);
    });

    try {
      await redis.connect();
      console.log(`✅ [Redis] ${C.green}连接成功: ${host}:${port} (db${defaultDb})${C.reset}`);

      globalRedis = redis;
      app.decorate('redis', redis);
      app.redisHealthy = true;
      setupRedisHealthMonitor(app, redis);

      /**
       * 获取指定数据库的 Redis 连接
       * 连接池缓存，按需创建，延迟连接
       *
       * @param {number} db - 数据库编号（0-15）
       * @param {number} [timeout=5000] - 连接超时毫秒
       * @returns {Promise<import('redis').RedisClientType|null>} Redis 客户端，连接失败返回 null
       */
      app.decorate('redisDb', async (db, timeout = 5000) => {
        if (db === defaultDb) return app.redis;

        if (_dbConnections.has(db)) {
          const cached = _dbConnections.get(db);
          if (cached.isOpen) return cached;
        }

        const client = createRedisConnection({ host, port, useTls, db });
        try {
          await Promise.race([
            client.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), timeout))
          ]);
          console.log(`✅ [Redis] ${C.green}数据库连接成功: db${db}${C.reset}`);
          _dbConnections.set(db, client);
          return client;
        } catch (err) {
          console.warn(`⚠️ [Redis] ${C.yellow}数据库连接失败: db${db} — ${err.message}${C.reset}`);
          client.quit().catch(() => {});
          return null;
        }
      });

      app.addHook('onClose', async () => {
        // 关闭所有数据库连接
        for (const [db, client] of _dbConnections) {
          try {
            await client.quit();
            console.log(`ℹ️ [Redis] ${C.cyan}数据库连接已关闭: db${db}${C.reset}`);
          } catch {
            // 安全忽略
          }
        }
        _dbConnections.clear();

        try {
          await redis.quit();
        } catch {
          // 连接已断开时 quit 会抛错，安全忽略
        }
        globalRedis = null;
      });
    } catch (err) {
      console.warn(`❌ [Redis] ${C.red}连接失败 ${host}:${port}: ${err.message}${C.reset}`);
      degrade(app, '连接失败');
    }
  },
  { name: 'redis-plugin' }
);
