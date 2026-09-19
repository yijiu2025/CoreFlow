/**
 * 系统健康检查路由
 *
 * 分三级语义，分别对应编排系统的三种判据：
 * - `GET /v1/health/live`  —— **存活探针**：只反映进程活着，**永远 200**。用于重启判据。
 * - `GET /v1/health/ready` —— **就绪探针**：关键依赖不可用即 **503**。用于摘流判据。
 * - `GET /v1/health`       —— 兼容保留（历史契约恒 200，语义等同 live），
 *   body 里额外给出 `ready` 摘要。**请新接入的监控改用上面两个端点。**
 *
 * 【为什么必须分级】
 * 原实现把依赖状态全塞进 body 而**状态码恒为 200**，编排系统无法区分
 * 「进程活着但已无法服务」与「完全健康」—— 一个 DB 连接池枯竭的实例会继续留在
 * 负载均衡池里接收流量，表现为用户看到零散 500，而健康检查一片绿。
 *
 * 【就绪判据为何要区分 skipped】
 * 只有**已配置**的依赖才参与判定：`REDIS_ENABLED!=true` 时访问层会走进程内 MapStore
 * 降级（是合法模式而非故障），把这种情况判成 not ready 会让本来能服务的实例被摘流。
 * 生产环境 DB 变量缺失时 `framework/db/index.js` 会在启动阶段直接终止进程，
 * 所以 DB 的 `skipped` 只可能出现在测试 / 本地环境。
 *
 * 【为什么不回显原始错误消息】
 * 本端点是 `requireLogin: false` 的**公开**端点，而 `sequelize.authenticate()` 的
 * 错误文本里常带 `ECONNREFUSED 10.0.0.5:3306` 这类内网拓扑信息，直接回显等于对外
 * 提供一张内网地图。因此 detail 只保留错误**代码/类型**，完整错误进日志。
 *
 * 【加载器状态】
 * body 里带 `loaders`：关键加载器失败会直接终止启动（进程根本起不来，探针无机会响应），
 * 所以这里能看到的一定是可降级加载器的失败明细 —— 服务可正常处理请求，但有一项附加
 * 能力缺失，`status` 记为 `degraded`（仍 200，不摘流）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-19 拆分 live / ready 两级探针，补依赖探测超时、错误脱敏与加载器明细
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { sequelize } from '../../../framework/db/index.js';
import { isRedisConfigured } from '../../../framework/redis/utils.js';
import { getLoaderStatus } from '../../../framework/loader/engine.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('api.system.health');

/**
 * 单个依赖的探测超时（毫秒）
 *
 * 必须有上限：DB 连接池枯竭时 `sequelize.authenticate()` 会一直等到 pool.acquire
 * 超时（默认 30s）才 reject，而编排系统的探针超时通常只有 1~5s ——
 * 探针会被自身超时掐断，表现为"探针不稳定"而不是"依赖不可用"，根因被掩盖。
 */
const READY_CHECK_TIMEOUT_MS = 3_000;

/** 加载器失败原因在响应里的最大长度（公开端点，避免整段堆栈外泄） */
const LOAD_ERROR_DETAIL_MAX = 200;

/**
 * 给 Promise 加上超时上限
 *
 * 用 `Promise.race` 而非 `.finally()` 收尾：race 会同时订阅被包裹的 Promise 与
 * 超时 Promise，因此两者后续的 reject 都有处理者，不会产生未处理拒绝把进程掀掉。
 *
 * @param {Promise<any>} promise - 原始 Promise
 * @param {number} ms - 超时毫秒数
 * @returns {Promise<any>} 原始 Promise 的返回值；超时则 reject（code: HEALTH_TIMEOUT）
 */
function raceTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`依赖探测超时 (${ms}ms)`), { code: 'HEALTH_TIMEOUT' })),
      ms
    );
  });

  const raced = Promise.race([promise, timeout]);
  raced.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer)
  );
  return raced;
}

/**
 * 把错误压成可对外暴露的短标签
 *
 * 只取错误代码/类型（如 `ECONNREFUSED` / `SequelizeConnectionRefusedError`），
 * 原始 message 里可能含内网地址、库名、SQL，不进响应体。
 *
 * @param {any} err - 捕获到的错误
 * @returns {string} 可公开的错误标签
 */
function errorLabel(err) {
  return err?.code || err?.name || 'unavailable';
}

/**
 * 判断 DB 是否已配置（与 `framework/db/index.js` 的启动校验同一组键）
 *
 * @returns {boolean} true 表示三个必要变量齐全
 */
function isDbConfigured() {
  return Boolean(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER);
}

/**
 * 探测数据库连通性
 *
 * @returns {Promise<{status: string, detail?: string}>} status ∈ up | down | skipped
 */
async function checkDatabase() {
  if (!isDbConfigured()) {
    return { status: 'skipped', detail: 'DB 未配置（测试/本地环境）' };
  }
  try {
    await raceTimeout(sequelize.authenticate(), READY_CHECK_TIMEOUT_MS);
    return { status: 'up' };
  } catch (err) {
    // 完整错误进日志（含地址/库名，供运维排障），响应只给标签
    log.error('❌ [Health] 数据库探测失败', err);
    return { status: 'down', detail: errorLabel(err) };
  }
}

/**
 * 读取 Redis 健康状态
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @returns {{status: string, detail?: string}} status ∈ up | down | skipped
 */
function checkRedis(app) {
  if (!isRedisConfigured()) {
    return { status: 'skipped', detail: 'Redis 未启用，当前为进程内降级实现' };
  }
  return app.redisHealthy ? { status: 'up' } : { status: 'down', detail: 'Redis 已配置但不可用' };
}

/**
 * 汇总加载器状态（只含可降级加载器的失败明细，见文件头说明）
 *
 * @returns {{total: number, failed: number, completed: boolean, errors: Array<{file: string, reason: string}>}} 加载器摘要
 */
function collectLoaderStatus() {
  const summary = getLoaderStatus();
  return {
    total: summary.total,
    failed: summary.failed,
    completed: summary.completed,
    errors: summary.loadErrors.map(e => ({
      file: e.file,
      reason: String(e.message || '').slice(0, LOAD_ERROR_DETAIL_MAX)
    }))
  };
}

/**
 * 汇总所有关键依赖与加载器的探测结果
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @returns {Promise<{dependencies: Record<string, object>, loaders: object, ready: boolean}>} 依赖与加载器明细
 */
async function probeDependencies(app) {
  const [database, redis] = await Promise.all([checkDatabase(), Promise.resolve(checkRedis(app))]);
  const dependencies = { database, redis };
  const loaders = collectLoaderStatus();
  // 就绪只看依赖：可降级加载器失败意味着功能降级，但仍能处理核心请求，不摘流
  const ready = Object.values(dependencies).every(dep => dep.status !== 'down');
  return { dependencies, loaders, ready };
}

/**
 * 注册系统健康检查路由
 *
 * @param {import('fastify').FastifyInstance} fastify - Fastify 实例
 * @returns {Promise<void>}
 */
async function registerHealthRoutes(fastify) {
  registerGroupMetadata({
    name: 'system',
    description: '系统端点',
    prefix: '/v1',
    requireLogin: false
  });

  /**
   * GET /health/live — 存活探针
   * 不触碰任何外部依赖，永远 200：进程能响应 HTTP 就说明它活着。
   * 一旦这里失败，编排系统应重启实例（而不是摘流）。
   */
  registerSecureRoute(fastify, {
    name: 'health-live',
    alias: '存活探针',
    method: 'GET',
    url: '/health/live',
    requireLogin: false,
    handler: async (request, reply) => {
      return reply.result.success('ok', {
        status: 'ok',
        uptime: Math.floor(process.uptime())
      });
    }
  });

  /**
   * GET /health/ready — 就绪探针
   * 关键依赖（DB / Redis）任一不可用即 503，编排系统应把实例摘出负载均衡池。
   * 可降级加载器失败不导致 503，只把总状态记为 degraded 并列出明细。
   */
  registerSecureRoute(fastify, {
    name: 'health-ready',
    alias: '就绪探针',
    method: 'GET',
    url: '/health/ready',
    requireLogin: false,
    handler: async (request, reply) => {
      const { dependencies, loaders, ready } = await probeDependencies(fastify);

      if (!ready) {
        // 503 而非 200：这是本端点存在的意义 —— 让编排系统能真正摘掉坏实例
        return reply.result.fail(
          '服务未就绪',
          {
            status: 'unavailable',
            uptime: Math.floor(process.uptime()),
            dependencies,
            loaders
          },
          503
        );
      }

      return reply.result.success('ok', {
        // 依赖全通但有加载器降级 → degraded，让监控能区分"完全健康"与"带伤运行"
        status: loaders.failed > 0 ? 'degraded' : 'ok',
        uptime: Math.floor(process.uptime()),
        dependencies,
        loaders
      });
    }
  });

  /**
   * GET /health — 兼容保留端点（历史契约恒 200）
   *
   * 这里刻意**不做**依赖探测：一旦改为随依赖返回 503，就等于悄悄改掉了既有契约，
   * 现有监控可能因此开始摘掉实例。就绪判定请显式使用 `/health/ready`。
   */
  registerSecureRoute(fastify, {
    name: 'health',
    alias: '健康检查（兼容保留，恒 200）',
    method: 'GET',
    url: '/health',
    requireLogin: false,
    handler: async (request, reply) => {
      return reply.result.success('ok', {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        redis: fastify.redisHealthy ? 'connected' : 'disconnected'
      });
    }
  });
}

export default registerHealthRoutes;
