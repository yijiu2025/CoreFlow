/**
 * Redis 客户端初始化插件
 * 创建连接、注册健康监控、注入 app.redis / app.redisHealthy
 * 支持多数据库连接：app.redisDb(1) 获取指定数据库的连接
 * 支持主备切换：REDIS_BACKUP_HOST 配置备用 Redis
 *
 * 连接管理：
 * - 主连接：启动时创建，自动重连（最多 10 次），失败时尝试备用 Redis
 * - 备用连接：主库永久失效后自动切换，切换后持续监控主库恢复
 * - 子连接：按需创建，连接池缓存（最多 16 个），闲置 30 分钟自动释放
 * - 首次连接：自动重试（最多 3 次，间隔 1s）
 *
 * 环境变量：
 *   REDIS_ENABLED      - 是否启用 Redis（true/false），默认 false
 *   REDIS_HOST         - 主库主机地址
 *   REDIS_PORT         - 主库端口，默认 6379
 *   REDIS_BACKUP_HOST  - 备库主机地址（可选）
 *   REDIS_BACKUP_PORT  - 备库端口，默认 6379
 *   REDIS_PASSWORD      - Redis 密码（可选）
 *   REDIS_TLS          - 是否启用 TLS（true/false），默认 false
 *   REDIS_DB           - 默认数据库编号（0-15），默认 0
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

/** 子连接闲置超时（毫秒） */
const DB_IDLE_TIMEOUT = 30 * 60 * 1000;

/** 首次连接最大重试次数 */
const INITIAL_RETRY_MAX = 3;

/**
 * 校验数据库编号是否合法
 * @param {number} db
 * @returns {boolean}
 */
function isValidDb(db) {
  return Number.isInteger(db) && db >= 0 && db <= 15;
}

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
 * @param {object} opts
 * @param {string} opts.host
 * @param {number|string} opts.port
 * @param {boolean} opts.useTls
 * @param {number} [opts.db=0]
 * @param {string} [opts.label] - 连接标签（主库/备库）
 * @param {Function} [opts.onExceeded] - 重连超限回调
 * @returns {import('redis').RedisClientType}
 */
function createRedisConnection({ host, port, useTls, db = 0, label = '', onExceeded }) {
  const tag = label ? `[${label}]` : `[db${db}]`;
  const client = createClient({
    socket: {
      host,
      port,
      tls: useTls,
      rejectUnauthorized: useTls,
      reconnectStrategy: retries => {
        if (retries > 10) {
          console.warn(`⚠️ [Redis] ${C.yellow}重连次数超限（10次），停止重连 ${tag}${C.reset}`);
          if (onExceeded) onExceeded();
          return new Error('Redis max retries exceeded');
        }
        const delay = Math.min(3000 * Math.pow(2, retries), 30_000);
        console.warn(`⚠️ [Redis] ${C.yellow}第 ${retries + 1} 次重连 ${tag}，${delay / 1000}秒后重试...${C.reset}`);
        return delay;
      }
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: db
  });

  client.on('error', err => {
    console.warn(`⚠️ [Redis] ${C.yellow}连接错误 ${tag}: ${err.message}${C.reset}`);
  });

  return client;
}

/**
 * 带重试的连接
 * @param {import('redis').RedisClientType} client
 * @param {number} maxRetries
 * @param {number} retryDelay
 * @returns {Promise<void>}
 */
async function connectWithRetry(client, maxRetries = INITIAL_RETRY_MAX, retryDelay = 1000) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      if (i < maxRetries) {
        console.warn(
          `⚠️ [Redis] ${C.yellow}第 ${i + 1} 次连接失败: ${err.message}，${retryDelay / 1000}秒后重试...${C.reset}`
        );
        await new Promise(r => setTimeout(r, retryDelay));
      } else {
        throw err;
      }
    }
  }
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
    const backupHost = process.env.REDIS_BACKUP_HOST;
    const backupPort = process.env.REDIS_BACKUP_PORT || 6379;
    const defaultDb = parseInt(process.env.REDIS_DB || '0', 10);

    // 当前使用的连接信息（可能被 failover 切换为备用）
    let currentHost = host;
    let currentPort = port;
    let isBackup = false;

    /**
     * 尝试连接（支持主备切换）
     */
    async function tryConnect(host, port, label) {
      const client = createRedisConnection({
        host,
        port,
        useTls,
        db: defaultDb,
        label,
        onExceeded: () => {
          app.redisHealthy = false;
          // 主库永久失效时尝试切换备库
          if (!isBackup && backupHost) {
            console.log(`ℹ️ [Redis] ${C.cyan}尝试切换到备用 Redis: ${backupHost}:${backupPort}${C.reset}`);
            tryConnect(backupHost, backupPort, '备用')
              .then(c => {
                if (c) applyClient(c, true);
              })
              .catch(() => {});
          }
        }
      });

      try {
        await connectWithRetry(client);
        return client;
      } catch {
        if (client) client.quit().catch(() => {});
        return null;
      }
    }

    /**
     * 应用客户端到 app
     */
    function applyClient(client, isBackupInstance) {
      isBackup = isBackupInstance;
      currentHost = isBackupInstance ? backupHost : host;
      currentPort = isBackupInstance ? backupPort : port;
      globalRedis = client;
      app.decorate('redis', client);
      app.redisHealthy = true;
      setupRedisHealthMonitor(app, client, () => {
        // 当前使用备库时，检测到主库恢复则尝试切回
        if (isBackup) {
          console.log(`ℹ️ [Redis] ${C.cyan}主库恢复，尝试切回: ${host}:${port}${C.reset}`);
          tryConnect(host, port, '主库')
            .then(c => {
              if (c) applyClient(c, false);
            })
            .catch(() => {});
        }
      });
    }

    const redis = await tryConnect(host, port, '主库');

    if (redis) {
      applyClient(redis, false);
      console.log(`✅ [Redis] ${C.green}连接成功: ${host}:${port} (db${defaultDb})${C.reset}`);
    } else if (backupHost) {
      // 主库连接失败，尝试备库
      console.log(`ℹ️ [Redis] ${C.cyan}主库连接失败，尝试备用 Redis: ${backupHost}:${backupPort}${C.reset}`);
      const backup = await tryConnect(backupHost, backupPort, '备用');
      if (backup) {
        applyClient(backup, true);
        console.log(`✅ [Redis] ${C.green}备用 Redis 连接成功: ${backupHost}:${backupPort}${C.reset}`);
      } else {
        degrade(app, '主库和备库均连接失败');
      }
    } else {
      degrade(app, '连接失败（未配置备用 Redis）');
    }

    // 注册子数据库连接方法
    app.decorate('redisDb', async (db, timeout = 5000) => {
      if (!isValidDb(db)) {
        console.warn(`⚠️ [Redis] ${C.yellow}无效数据库编号: ${db}，仅支持 0-15${C.reset}`);
        return null;
      }
      if (db === defaultDb) return app.redis;
      // ... 子连接逻辑保持不变
      if (_dbConnections.has(db)) {
        const cached = _dbConnections.get(db);
        if (cached.client.isReady) {
          cached.lastUsed = Date.now();
          return cached.client;
        }
        cached.client.quit().catch(() => {});
        _dbConnections.delete(db);
      }

      const client = createRedisConnection({ host: currentHost, port: currentPort, useTls, db });
      try {
        await Promise.race([
          connectWithRetry(client, 1, 1000),
          new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), timeout))
        ]);
        console.log(`✅ [Redis] ${C.green}数据库连接成功: db${db}${C.reset}`);

        const idleTimer = setTimeout(() => {
          if (_dbConnections.has(db)) {
            const entry = _dbConnections.get(db);
            if (entry.client === client) {
              client.quit().catch(() => {});
              _dbConnections.delete(db);
              console.log(`ℹ️ [Redis] ${C.cyan}闲置连接已释放: db${db}${C.reset}`);
            }
          }
        }, DB_IDLE_TIMEOUT);
        idleTimer.unref();

        _dbConnections.set(db, { client, lastUsed: Date.now(), idleTimer });
        return client;
      } catch (err) {
        console.warn(`⚠️ [Redis] ${C.yellow}数据库连接失败: db${db} — ${err.message}${C.reset}`);
        client.quit().catch(() => {});
        return null;
      }
    });

    app.addHook('onClose', async () => {
      for (const [db, entry] of _dbConnections) {
        clearTimeout(entry.idleTimer);
        try {
          await entry.client.quit();
          console.log(`ℹ️ [Redis] ${C.cyan}数据库连接已关闭: db${db}${C.reset}`);
        } catch {
          /* 安全忽略 */
        }
      }
      _dbConnections.clear();
      try {
        if (globalRedis) await globalRedis.quit();
      } catch {
        /* 安全忽略 */
      }
      globalRedis = null;
    });
  },
  { name: 'redis-plugin' }
);
