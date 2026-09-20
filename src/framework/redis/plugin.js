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

import { createClient } from 'redis';
import fs from 'node:fs';
import path from 'node:path';
import fp from 'fastify-plugin';
import { setupRedisHealthMonitor } from './health.js';
import { setLogger, getCacheStats } from './redis-store.js';
import { probeTcp, DEFAULT_PROBE_TIMEOUT } from './probe.js';
import { C } from '../../utils/colors.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.redis.plugin');

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

/** `connectStandalone()` 连接阶段默认上限（毫秒） */
const STANDALONE_TIMEOUT_MS = 10_000;

/**
 * 本地有界等待：超时即 reject，并清理定时器
 *
 * 不复用 `utils.js` 的 `withTimeout` —— `utils.js` 反向 import 本模块的
 * `globalRedis`，在此处引用会形成循环依赖。实现同样避免 `.finally()`
 * （会派生孤儿 promise，把一次普通超时升级为未处理拒绝）。
 *
 * @param {Promise<any>} promise - 被等待的 promise
 * @param {number} ms - 超时毫秒
 * @param {string} message - 超时错误文案
 * @returns {Promise<any>}
 */
function withLocalTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  const result = Promise.race([promise, timeout]);
  result.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer)
  );
  return result;
}

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
    log.warn(`⚠️ [Redis] ${C.yellow}TLS CA 路径不合法，已忽略: ${caPath}${C.reset}`);
    return undefined;
  }
  if (_caCache.has(caPath)) return _caCache.get(caPath);
  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    _caCache.set(caPath, content);
    _capMap(_caCache, MAX_CA_CACHE);
    return content;
  } catch (err) {
    log.warn(`⚠️ [Redis] ${C.yellow}读取 TLS CA 失败: ${caPath}${C.reset}`, err);
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
  log.always(`ℹ️ [Redis] ${C.cyan}${reason}，主 Redis 降级为不可用${C.reset}`);
  globalRedis = null;
  redisHealthy = false;
  app.redis = null;
  app.redisHealthy = false;
}

/** 首次重连延迟（毫秒）：给瞬时抖动一个快恢复的机会 */
const FIRST_RETRY_DELAY = 500;

/** 单次退避上限（毫秒）：避免退避无节制增长 */
const MAX_BACKOFF_DELAY = 15_000;

/** `forever` 策略在重试超限后的低频探测间隔（毫秒） */
const SLOW_PROBE_DELAY = 30_000;

/**
 * 重连退避决策（纯函数，无副作用、无 IO）
 *
 * 抽出来的理由是可测性：`reconnectStrategy` 的返回语义有两种截然不同的结果
 * （数字 = 继续等；`Error` = 彻底放弃），而这两种结果决定了调用方是「永远连下去」
 * 还是「在有界时间内拿到失败结论」。这段决策直接内联在客户端回调里时
 * 只能靠真实网络场景间接覆盖，抽成纯函数后可以被逐条钉死。
 *
 * @param {object} opts
 * @param {number} opts.retries - 已重试次数（node-redis 传入，从 0 开始计数）
 * @param {number} [opts.maxRetries=10] - 超过该次数即视为超限
 * @param {'forever'|'bounded'} [opts.policy='forever']
 * @returns {{delay: number, slowProbe?: boolean, giveUp?: boolean, message?: string}}
 *   - `delay`：下次重连前等待的毫秒数（`giveUp` 时无意义）
 *   - `slowProbe`：处于超限后的低频探测阶段
 *   - `giveUp`：调用方应返回 `Error`，让 node-redis 停止重连并使 `connect()` reject
 */
function resolveReconnectDelay({ retries, maxRetries = 10, policy = 'forever' }) {
  if (retries >= maxRetries) {
    if (policy === 'bounded') {
      return { delay: 0, giveUp: true, message: `Redis 重连超限（已重试 ${maxRetries} 次）` };
    }
    return { delay: SLOW_PROBE_DELAY, slowProbe: true };
  }
  const delay = retries === 0 ? FIRST_RETRY_DELAY : Math.min(1000 * Math.pow(2, retries - 1), MAX_BACKOFF_DELAY);
  return { delay };
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
 * @param {'forever'|'bounded'} [opts.retryPolicy='forever'] 重连超限后的行为：
 *   - `forever`（默认，常驻服务用）：转入 30s 低频探测，**永不停止**，
 *     保证 Redis 恢复后自动连回。代价是 `connect()` 永不 reject。
 *   - `bounded`（CLI / 脚本 / 验收关卡用）：返回 `Error` 让 node-redis 停止重连，
 *     `connect()` 随之 reject —— 这是「调用方自己设超时」之外的第二道保险，
 *     只靠外层 `Promise.race` 的话，客户端仍会在后台持续重连。
 * @returns {import('redis').RedisClientType}
 */
function createRedisConnection({
  host,
  port,
  useTls,
  db = 0,
  label = '',
  connectTimeout = 5000,
  maxRetries = 10,
  retryPolicy = 'forever'
}) {
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

  // 重连策略：决策交给纯函数 resolveReconnectDelay（可单测），此处只做日志与返回值转换
  // 超限后：forever 模式改为 30s 低频探测（不停止重连）；bounded 模式直接放弃
  socket.reconnectStrategy = retries => {
    const decision = resolveReconnectDelay({ retries, maxRetries, policy: retryPolicy });
    if (decision.giveUp) {
      log.warn(`⚠️ [Redis] ${C.yellow}重连超限（${maxRetries} 次），放弃连接 ${tag}${C.reset}`);
      return new Error(`${decision.message}${tag}`);
    }
    if (decision.slowProbe) {
      log.warn(`⚠️ [Redis] ${C.yellow}重连超限，进入慢速探测模式 ${tag}${C.reset}`);
    } else {
      log.warn(`⚠️ [Redis] ${C.yellow}第 ${retries + 1} 次重连 ${tag}，${decision.delay / 1000}秒后重试...${C.reset}`);
    }
    return decision.delay;
  };

  const client = createClient({
    socket,
    username,
    password: process.env.REDIS_PASSWORD || undefined,
    database: db
  });

  client.on('error', err => {
    log.warn(`⚠️ [Redis] ${C.yellow}连接错误 ${tag}${C.reset}`, err);
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
        log.warn(
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
    log.warn(`⚠️ [Redis] ${C.yellow}${label}优雅关闭超时，强制断开${C.reset}`);
    try {
      client.disconnect();
    } catch {
      /* 安全忽略 */
    }
  }
}

/**
 * 独立进程引导：为 CLI / 脚本建立与 Fastify 插件等价的主 Redis 连接。
 *
 * 背景：连接逻辑挂在 Fastify 插件里，只有 app 启动时才会执行。`npm run cli` 只加载模型、
 * 不启动 app，因此模块级 `globalRedis` 恒为 null；此时 `getStore()` 仍会按
 * `isRedisConfigured()`（只看环境变量）走 Redis 分支，却拿不到连接 → 一路抛
 * `RedisRequiredError`，表现为「同一个存储层在 app 里能用、在 CLI 里全废」。
 *
 * 本函数复用插件内**同一套**连接参数与重试策略，把连接挂到 `globalRedis`，
 * 使 `getStore()` / `RedisStore` 在非 Fastify 环境下同样可用。与之配套，
 * 退出前必须调用 `disconnectStandalone()`，否则未关闭的 socket 会让进程无法自然退出。
 *
 * === 有界返回（2026-09-20 修正） ===
 * 旧注释称「最多重试 1 次」，但真正决定重试次数的是客户端内的 `reconnectStrategy`
 * （取 `REDIS_MAX_RETRIES`，默认 10），`connectWithRetry(client, 1)` 只是外层循环。
 * 更糟的是该策略超限后**永不返回 Error**，`client.connect()` 因此**永不 reject** ——
 * 实测 Redis 不可达时 verify 关卡挂到 3 分钟以上仍无结论，而不是文档所说的 90s。
 *
 * 现在分两道保险，使「环境不可用」必定在有界时间内以 `ready:false` 返回：
 *   ① `probeTcp()` 先做有界 TCP 预检 —— 端口不通时毫秒级给出结论，不进客户端退避；
 *   ② 连接阶段改用 `retryPolicy:'bounded'` + 外层超时兜底 —— 策略超限即放弃。
 * 常驻服务（Fastify 插件）不受影响，仍用 `forever` 策略保证自动重连。
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=10000] 整体连接上限（毫秒），仅约束连接阶段
 * @returns {Promise<{ready: boolean, reason?: string, code?: string}>}
 *          ready=false 表示未启用、配置非法或连接失败；`code` 便于调用方分流
 *          （'NOT_CONFIGURED' | 'BAD_DB' | 'TCP_UNREACHABLE' | 'CONNECT_FAILED'）
 */
async function connectStandalone(opts = {}) {
  if (process.env.REDIS_ENABLED !== 'true' || !process.env.REDIS_HOST) {
    return { ready: false, code: 'NOT_CONFIGURED', reason: 'REDIS_ENABLED 未开启或 REDIS_HOST 未配置' };
  }
  // 幂等：已在 app/上次引导中连接成功则直接复用
  if (globalRedis && globalRedis.isReady) return { ready: true };

  const host = process.env.REDIS_HOST;
  const port = parsePort(process.env.REDIS_PORT) ?? 6379;
  const db = parseInt(process.env.REDIS_DB || '0', 10);
  if (!isValidDb(db)) {
    return { ready: false, code: 'BAD_DB', reason: `REDIS_DB 非法（仅支持 0-15）: ${process.env.REDIS_DB}` };
  }

  const timeoutRaw = Number(opts.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : STANDALONE_TIMEOUT_MS;
  // 预检预算取整体上限的三分之一，并夹在 [500ms, DEFAULT_PROBE_TIMEOUT] —— 保证
  // 「预检 + 连接」两段之和不会超过调用方给的预算数量级。
  const probeBudget = Math.min(Math.max(Math.floor(timeoutMs / 3), 500), DEFAULT_PROBE_TIMEOUT);

  const connectTimeoutRaw = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10);
  const connectTimeout = Number.isFinite(connectTimeoutRaw) ? connectTimeoutRaw : 5000;
  const maxRetriesRaw = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
  const maxRetries = Number.isFinite(maxRetriesRaw) ? maxRetriesRaw : 10;

  // ① 有界 TCP 预检：不通就地返回，不进入客户端的指数退避
  const probe = await probeTcp(host, port, probeBudget);
  if (!probe.ok) {
    return {
      ready: false,
      code: 'TCP_UNREACHABLE',
      reason: `TCP ${host}:${port} 不可达（${probe.code}，${probe.ms}ms）`
    };
  }

  const client = createRedisConnection({
    host,
    port,
    useTls: process.env.REDIS_TLS === 'true',
    db,
    label: 'CLI',
    connectTimeout,
    maxRetries,
    retryPolicy: 'bounded'
  });

  try {
    // ② 外层超时兜底：即使策略因故未放弃，也在预算内给调用方一个确定的结论
    await withLocalTimeout(connectWithRetry(client, 1), timeoutMs, `Redis 连接超时（${timeoutMs}ms）`);
  } catch (err) {
    // 关键：连接失败后客户端可能仍在后台重连，不主动断开会让 CLI 进程退不出去。
    try {
      client.disconnect();
    } catch {
      /* 安全忽略 */
    }
    return { ready: false, code: 'CONNECT_FAILED', reason: err.message };
  }

  globalRedis = client;
  redisHealthy = true;
  return { ready: true };
}

/**
 * 关闭由 `connectStandalone()` 建立的主 Redis 连接（CLI / 脚本退出前调用）
 *
 * 只清理本函数建立的连接；若连接由 Fastify 插件建立（app 内调用），
 * 仍应由插件的 onClose 钩子负责关闭。
 *
 * @returns {Promise<void>}
 */
async function disconnectStandalone() {
  if (!globalRedis) return;
  const client = globalRedis;
  globalRedis = null;
  redisHealthy = false;
  await drainAndClose(client, 'CLI ');
}

const redisPlugin = fp(
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
      log.warn(
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
      log.always(`✅ [Redis] ${C.green}主库连接成功: ${host}:${port} (db${defaultDb})${C.reset}`);
    } catch (err) {
      log.warn(`⚠️ [Redis] ${C.yellow}主库连接失败${C.reset}`, err);
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
          log.always(`✅ [Redis] ${C.green}备用 Redis 连接成功: ${backupHost}:${backupPort}${C.reset}`);
        })
        .catch(err => {
          log.warn(`⚠️ [Redis] ${C.yellow}备用 Redis 首次连接失败，后台重连中...${C.reset}`, err);
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

export {
  globalRedis,
  redisHealthy,
  backupRedis,
  backupRedisHealthy,
  connectStandalone,
  disconnectStandalone,
  resolveReconnectDelay
};
export default redisPlugin;
