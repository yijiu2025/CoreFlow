/**
 * Redis 客户端初始化插件
 * 创建主 Redis 连接 + 可选备用 Redis 连接
 *
 * === 主 Redis（严格模式） ===
 * - 启动时重试连接，失败则降级到内存模式（app.redis = null）
 * - 运行期自动重连，重连超限后标记不健康，所有 Redis 操作抛 RedisRequiredError
 * - 不再自动切换到备用服务器，防止数据不一致
 *
 * === 备用 Redis（短时效数据） ===
 * - 通过 REDIS_BACKUP_HOST 配置，独立连接
 * - 仅用于存短时效数据（限流计数、验证码等），不承担主库 failover 职责
 * - 需在 getStore() 中显式指定 backup: true 才会使用
 *
 * 环境变量：
 *   REDIS_ENABLED       - 是否启用 Redis（true/false），默认 false
 *   REDIS_HOST          - 主库主机地址
 *   REDIS_PORT          - 主库端口，默认 6379
 *   REDIS_BACKUP_HOST   - 备库主机地址（可选）
 *   REDIS_BACKUP_PORT   - 备库端口，默认 6379
 *   REDIS_PASSWORD      - Redis 密码（可选）
 *   REDIS_USERNAME      - Redis 6 ACL 用户名（可选）
 *   REDIS_TLS           - 是否启用 TLS（true/false），默认 false
 *   REDIS_TLS_CA        - TLS CA 证书路径（自签证书场景，可选）
 *   REDIS_TLS_SKIP_VERIFY - 跳过 TLS 证书验证（true/false），默认 false，调试自签证书时使用
 *   REDIS_DB            - 默认数据库编号（0-15），默认 0
 *   REDIS_CONNECT_TIMEOUT - 连接超时毫秒，默认 5000
 *   REDIS_MAX_RETRIES    - 重连最大次数，默认 10
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

/* eslint-disable no-console */

import { createClient } from 'redis';
import fs from 'node:fs';
import path from 'node:path';
import fp from 'fastify-plugin';
import { setupRedisHealthMonitor } from './health.js';
import { setLogger, getCacheStats } from './redis-store.js';
import { C } from '../../utils/colors.js';

/** 全局主 Redis 客户端引用（推荐使用 app.redis） */
let globalRedis = null;

/** 模块级主 Redis 健康状态 */
let redisHealthy = false;

/** 全局备用 Redis 客户端引用（可选，短时效数据） */
let backupRedis = null;

/** 模块级备用 Redis 健康状态 */
let backupRedisHealthy = false;

/** 首次连接最大重试次数 */
const INITIAL_RETRY_MAX = 3;

/** 旧客户端 drain 超时（毫秒），超时强制断开 */
const DRAIN_TIMEOUT = 10_000;

/** TLS CA 文件内容缓存（上限 10 条，避免路径注入导致内存泄漏） */
const _caCache = new Map();
const MAX_CA_CACHE = 10;

/**
 * 超出上限时淘汰最旧条目，保持 Map 大小可控
 */
function _capMap(map, maxSize) {
  if (map.size <= maxSize) return;
  const deleteCount = map.size - maxSize;
  for (let i = 0; i < deleteCount; i++) {
    const key = map.keys().next().value;
    if (key !== undefined) map.delete(key);
  }
}

function getTlsCaContent(caPath) {
  if (!caPath) return undefined;
  // 路径合法性校验：确保解析后是绝对路径，防止路径遍历
  const resolved = path.resolve(caPath);
  if (resolved !== caPath && !caPath.startsWith('.' + path.sep) && !caPath.startsWith('..' + path.sep)) {
    console.warn(`⚠️ [Redis] ${C.yellow}TLS CA 路径不合法，已忽略: ${caPath}${C.reset}`);
    return undefined;
  }
  if (_caCache.has(caPath)) return _caCache.get(caPath);
  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    _caCache.set(caPath, content);
    _capMap(_caCache, MAX_CA_CACHE);
    return content;
  } catch (err) {
    console.warn(`⚠️ [Redis] ${C.yellow}读取 TLS CA 失败: ${caPath} — ${err.message}${C.reset}`);
    return undefined;
  }
}

function isValidDb(db) {
  return Number.isInteger(db) && db >= 0 && db <= 15;
}

function parsePort(raw) {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return null;
  return n;
}

/**
 * 降级主 Redis 到内存模式
 * 注意：仅影响主库，备用 Redis 不受影响
 */
function degrade(app, reason) {
  console.log(`ℹ️ [Redis] ${C.cyan}${reason}，主 Redis 降级为不可用${C.reset}`);
  globalRedis = null;
  redisHealthy = false;
  app.redis = null;
  app.redisHealthy = false;
}

/**
 * 创建 Redis 连接
 * @param {object} opts
 * @param {string} opts.host
 * @param {number} opts.port
 * @param {boolean} opts.useTls
 * @param {number} [opts.db=0]
 * @param {string} [opts.label] - 连接标签
 * @param {number} [opts.connectTimeout=5000]
 * @param {number} [opts.maxRetries=10]
 * @returns {import('redis').RedisClientType}
 */
function createRedisConnection({ host, port, useTls, db = 0, label = '', connectTimeout = 5000, maxRetries = 10 }) {
  const tag = label ? `[${label}]` : `[db${db}]`;
  const username = process.env.REDIS_USERNAME || undefined;
  const caPath = process.env.REDIS_TLS_CA;

  const socket = {
    host,
    port,
    tls: useTls,
    rejectUnauthorized: useTls && process.env.REDIS_TLS_SKIP_VERIFY !== 'true',
    connectTimeout,
    keepAlive: 30_000,
    noDelay: true
  };
  if (useTls && caPath) {
    const ca = getTlsCaContent(caPath);
    if (ca) socket.ca = ca;
  }

  // 重连策略：首次 500ms 快速恢复，然后指数退避
  // 超限后改为 30s 低频探测，不停止重连，确保 Redis 恢复后自动连回
  socket.reconnectStrategy = retries => {
    if (retries >= maxRetries) {
      console.warn(`⚠️ [Redis] ${C.yellow}重连超限，进入慢速探测模式 ${tag}${C.reset}`);
      return 30_000;
    }
    const delay = retries === 0 ? 500 : Math.min(1000 * Math.pow(2, retries - 1), 15_000);
    console.warn(`⚠️ [Redis] ${C.yellow}第 ${retries + 1} 次重连 ${tag}，${delay / 1000}秒后重试...${C.reset}`);
    return delay;
  };

  const client = createClient({
    socket,
    username,
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
 */
async function connectWithRetry(client, maxRetries = INITIAL_RETRY_MAX) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      if (i < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, i), 10_000);
        console.warn(
          `⚠️ [Redis] ${C.yellow}第 ${i + 1} 次连接失败: ${err.message}，${Math.round(delay / 100) / 10}秒后重试...${C.reset}`
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

/**
 * 优雅关闭客户端：先 quit 排空，超时则强制 disconnect
 */
async function drainAndClose(client, label = '') {
  if (!client) return;
  let timer;
  try {
    await Promise.race([
      client.quit(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('drain timeout')), DRAIN_TIMEOUT);
      })
    ]);
    clearTimeout(timer);
  } catch {
    clearTimeout(timer);
    console.warn(`⚠️ [Redis] ${C.yellow}${label}优雅关闭超时，强制断开${C.reset}`);
    try {
      client.disconnect();
    } catch {
      /* 安全忽略 */
    }
  }
}

export default fp(
  async app => {
    const enabled = process.env.REDIS_ENABLED === 'true';

    // 启动时注册装饰器
    app.decorate('redis', null);
    app.decorate('redisHealthy', false);
    app.decorate('backupRedis', null);
    app.decorate('backupRedisHealthy', false);

    // 注册时注入日志器到 RedisStore
    setLogger(app.log);

    const healthMonitor = setupRedisHealthMonitor(app, {
      onStateChange: h => {
        redisHealthy = h;
      }
    });

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
    const port = parsePort(process.env.REDIS_PORT) ?? 6379;
    const backupHost = process.env.REDIS_BACKUP_HOST;
    const backupPort = parsePort(process.env.REDIS_BACKUP_PORT) ?? 6379;
    const defaultDb = parseInt(process.env.REDIS_DB || '0', 10);
    const connectTimeoutRaw = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10);
    const connectTimeout = Number.isFinite(connectTimeoutRaw) ? connectTimeoutRaw : 5000;
    const maxRetriesRaw = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
    const maxRetries = Number.isFinite(maxRetriesRaw) ? maxRetriesRaw : 10;

    // 启动期配置校验
    if (port === null && process.env.REDIS_PORT) {
      degrade(app, `REDIS_PORT 非法: ${process.env.REDIS_PORT}`);
      return;
    }
    if (backupHost && backupPort === null && process.env.REDIS_BACKUP_PORT) {
      console.warn(
        `⚠️ [Redis] ${C.yellow}REDIS_BACKUP_PORT 非法: ${process.env.REDIS_BACKUP_PORT}，跳过备用连接${C.reset}`
      );
    }
    if (!isValidDb(defaultDb)) {
      degrade(app, `REDIS_DB 非法（仅支持 0-15）: ${process.env.REDIS_DB}`);
      return;
    }

    // ===== 主 Redis 连接 =====
    try {
      const primaryClient = createRedisConnection({
        host,
        port,
        useTls,
        db: defaultDb,
        label: '主库',
        connectTimeout,
        maxRetries
      });
      await connectWithRetry(primaryClient);
      globalRedis = primaryClient;
      redisHealthy = true;
      app.redis = primaryClient;
      app.redisHealthy = true;
      healthMonitor.attach(primaryClient);
      console.log(`✅ [Redis] ${C.green}主库连接成功: ${host}:${port} (db${defaultDb})${C.reset}`);
    } catch (err) {
      console.warn(`⚠️ [Redis] ${C.yellow}主库连接失败: ${err.message}${C.reset}`);
      degrade(app, '主库连接失败');
    }

    // ===== 备用 Redis 连接（可选，后台静默连接，不阻塞启动） =====
    if (backupHost) {
      const backupClient = createRedisConnection({
        host: backupHost,
        port: backupPort,
        useTls,
        db: defaultDb,
        label: '备用',
        connectTimeout: Math.min(connectTimeout, 3000),
        maxRetries: 3
      });

      // 监听备用 Redis 断开/就绪事件，更新健康状态
      backupClient.on('end', () => {
        backupRedisHealthy = false;
        app.backupRedisHealthy = false;
      });
      backupClient.on('ready', () => {
        backupRedis = backupClient;
        backupRedisHealthy = true;
        app.backupRedis = backupClient;
        app.backupRedisHealthy = true;
      });

      // 静默连接，失败后由 reconnectStrategy 继续重连，不丢弃客户端
      connectWithRetry(backupClient, 1)
        .then(() => {
          backupRedis = backupClient;
          backupRedisHealthy = true;
          app.backupRedis = backupClient;
          app.backupRedisHealthy = true;
          console.log(`✅ [Redis] ${C.green}备用 Redis 连接成功: ${backupHost}:${backupPort}${C.reset}`);
        })
        .catch(err => {
          console.warn(`⚠️ [Redis] ${C.yellow}备用 Redis 首次连接失败，后台重连中... ${err.message}${C.reset}`);
          // 不设 backupRedis = null，让 reconnectStrategy 继续重连
          // ready 事件触发后会自动更新状态
          backupRedisHealthy = false;
          app.backupRedisHealthy = false;
        });
    }

    // 注册指标查询方法
    app.decorate('redisMetrics', () => {
      const cacheStats = getCacheStats();
      return {
        healthy: app.redisHealthy,
        host,
        port,
        backupHealthy: !!backupRedis && backupRedis.isReady,
        backupHost: backupHost || null,
        cache: cacheStats
      };
    });

    // 异步获取 Redis INFO 指标（连接数、内存、命中率、吞吐量）
    app.decorate('getRedisInfo', async () => {
      if (!app.redis || !app.redis.isReady) return null;
      try {
        const info = await Promise.race([
          app.redis.info(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('INFO 超时')), 3000))
        ]);
        const lines = info.split('\r\n');
        const get = key => {
          const line = lines.find(l => l.startsWith(key + ':'));
          return line ? line.split(':')[1] : '0';
        };
        return {
          connectedClients: parseInt(get('connected_clients'), 10),
          usedMemory: parseInt(get('used_memory'), 10),
          usedMemoryHuman: get('used_memory_human'),
          opsPerSec: parseInt(get('instantaneous_ops_per_sec'), 10),
          hitRatio: (() => {
            const hits = parseInt(get('keyspace_hits'), 10);
            const misses = parseInt(get('keyspace_misses'), 10);
            const total = hits + misses;
            return total > 0 ? (hits / total).toFixed(3) : '0';
          })(),
          uptimeInSeconds: parseInt(get('uptime_in_seconds'), 10)
        };
      } catch {
        return null;
      }
    });

    app.addHook('onClose', async () => {
      try {
        if (backupRedis) await drainAndClose(backupRedis, '备用 Redis ');
      } catch {
        /* 安全忽略 */
      }
      backupRedis = null;
      try {
        if (globalRedis) await drainAndClose(globalRedis, '主库 ');
      } catch {
        /* 安全忽略 */
      }
      globalRedis = null;
    });
  },
  { name: 'redis-plugin' }
);

export { globalRedis, redisHealthy, backupRedis, backupRedisHealthy };
