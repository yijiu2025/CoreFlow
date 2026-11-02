/**
 * 速率限制检测
 *
 * 本项目**不再自己实现计数器**（2026-11-02）：窗口计数一律交给
 * `@fastify/rate-limit` 的 `fastify.createRateLimit()`，本模块只负责
 * 「超限之后做什么」（写一条自动封禁 + 抛 429）。
 *
 * 为什么改：
 *   1. 旧实现在访问层自己维护了一套 Redis ZSET 滑窗（`consumeRateWindow`），
 *      与插件的固定窗口**两套语义并存**：同一件事两套代码、两套键、两套内存降级；
 *   2. 那套滑窗的 actor 键是 `路径:IP`，超限时 `setBlock(actorId)` 写出的是
 *      `fw:block:/api/order:1.2.3.4` —— **永远匹配不到真实 IP**，封禁从未生效；
 *   3. 库自带 `ban` / `onExceeded` / `increment:false` 等能力，够用且经过验证。
 *
 * 现在：计数由库完成（`store` 仍是我们的 resilient store，Redis 优先、故障降级内存），
 * 本模块用 `status.isExceeded` 判定，封禁键用**真实 IP**。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-02 计数改为库的 createRateLimit，删除自研滑窗
 */
import { getConfig, ipRequestTimestamps } from '../../util/shared.js';
import { setBlock } from '../../block-manager.js';
import { createLogger } from '../../../log/index.js';

const log = createLogger('framework.firewall.engine.detectors.rate-limiter');

/**
 * 单个 IP 在窗口内最多保留的时间戳条数（内存上限保护）
 *
 * 为什么需要：本表是「IP → 时间戳数组」，内存随窗口内请求数**线性增长**且原先无上限。
 * 实测每 IP 60 条 ≈ 773B，600 条 ≈ 5KB —— 单 IP 高频足以把单条记录撑到 MB 级
 * （全局限频默认关闭，这条路径不保证先被限流拦住）。
 * 到达上限后停止记录（计数饱和在 1000）：此时该 IP 已在 60s 内打了 1000 次请求，
 * 早越过所有挑战阈值（默认最大 120），继续攒时间戳对判定毫无增益。
 * 若把 `botChallenge*Limit` 配到 1000 以上，判定会饱和在 1000 —— 与「早就该封」的语义一致。
 */
const MAX_WINDOW_ENTRIES = 1000;

/**
 * 追踪 IP 请求次数（基于内存滑动窗口，供 Bot 检测的「短时高频」判断使用）
 *
 * @param {string} ip 客户端 IP
 * @returns {number} 60 秒窗口内的请求数（含本次）
 */
function trackRequestCount(ip) {
  const now = Date.now();
  const windowMs = 60_000;

  if (!ipRequestTimestamps.has(ip)) {
    ipRequestTimestamps.set(ip, []);
  }

  const timestamps = ipRequestTimestamps.get(ip);
  // 索引式裁剪：一次 splice 移走整段过期记录。逐个 shift 会让数组头反复收缩，
  // 高频 IP 上是 O(n²) 的 CPU 放大器（旧的逐条 shift 写法在 60 条/窗口时已经不明显，
  // 但在满窗口 1000 条时每次请求都要搬 1000 次）。
  let drop = 0;
  while (drop < timestamps.length && timestamps[drop] < now - windowMs) drop++;
  if (drop > 0) timestamps.splice(0, drop);

  if (timestamps.length < MAX_WINDOW_ENTRIES) timestamps.push(now);
  return timestamps.length;
}

/**
 * 限流器工厂（按「键前缀 + 阈值 + 窗口」缓存）
 *
 * 为什么缓存：`fastify.createRateLimit()` 每次调用都会 `store.child()` 出一个新 store 实例
 * （各自有内存降级表），放在请求路径上每请求创建一次会持续泄漏。同一组参数复用同一个即可。
 *
 * @param {import('fastify').FastifyInstance} server Fastify 实例
 * @param {{keyPrefix: string, max: number, windowMs: number}} params 参数
 * @returns {Function} `(request) => Promise<{isAllowed:boolean,isExceeded:boolean,ttlInSeconds:number}>`
 */
const limiterCache = new Map();

/**
 * 缓存的限流器上限
 *
 * 每个 `createRateLimit()` 都会 `store.child()` 出一个新的 store 实例（各自带内存降级表，
 * 且会注册进框架的全局实例集合，只有 `app.close()` 才清理）。参数键包含 max / window，
 * 面板反复调阈值时会不断产生新 key —— 必须封顶，否则是一处**配置驱动的泄漏**。
 */
const MAX_LIMITERS = 32;

function limiterFor(server, { keyPrefix, max, windowMs }) {
  const cacheKey = `${keyPrefix}|${max}|${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    if (limiterCache.size >= MAX_LIMITERS) {
      log.warn(
        `[Firewall] 限流器缓存达到上限 ${MAX_LIMITERS}，清空重建（阈值被频繁改动？旧实例的 store 仍挂在实例集合里，直到 app.close）`
      );
      limiterCache.clear();
    }
    limiter = server.createRateLimit({
      max,
      timeWindow: windowMs,
      // 键 = 前缀 + 真实 IP：不同规则各自成桶，不会互相吃额度
      keyGenerator: req => `${keyPrefix}:${req.ip}`
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * 核心速率限制检查（计数交给 `@fastify/rate-limit`，本函数只做「超限后封禁」）
 *
 * 判定：窗口内请求数 > limit → 写一条有时限的自动封禁（键是**真实 IP**）并抛 429。
 *
 * 为什么不再自己计数：见文件头。库的 `createRateLimit` 已经提供计数 + 窗口 + 存储，
 * 且 `store` 仍是我们的 resilient store（Redis 优先、故障降级内存），语义一致。
 *
 * ⚠️ 调用前无需再查封禁状态：本函数只在深度检测阶段被调用，而第 2 阶段
 * （`checkGlobalBlockPhase`）已经查过并短路了已封禁请求。
 *
 * @param {import('fastify').FastifyRequest} request Fastify 请求对象（取 ip 与 server）
 * @param {object} [options] 限频参数
 * @param {string} [options.keyPrefix='rl'] 计数桶前缀（不同规则用不同前缀以免互相吃额度）
 * @param {number} [options.limit=50] 窗口内允许的请求数
 * @param {number} [options.window=60] 窗口秒数
 * @param {number} [options.blockTime=60] 触发后的封禁秒数
 * @returns {Promise<true>} 放行（未超限 / 端点级限频已关闭 / 插件未注册）
 * @throws {Error} 超限：statusCode=429，带 Retry-After
 */
const checkRateLimit = async (request, options = {}) => {
  const { keyPrefix = 'rl', limit = 50, window = 60, blockTime = 60 } = options;

  // 端点级限频总开关（默认开启）
  if (getConfig().defense?.enableEndpointRateLimit === false) return true;

  const server = request?.server;
  // 插件未注册（两个开关都为 false 的「真·不限流」形态）：没有计数器可用，直接放行
  if (typeof server?.createRateLimit !== 'function') return true;

  const limiter = limiterFor(server, { keyPrefix, max: limit, windowMs: window * 1000 });
  const status = await limiter(request);

  // isAllowed=true 表示命中 allowList（本层未配置），直接放行
  if (status.isAllowed || !status.isExceeded) return true;

  // 只取一次时间：createdAt 与 expiresAt 必须由同一个 now 推导
  const now = Date.now();
  await setBlock(request.ip, {
    status: 'BLOCKED',
    source: 'auto',
    permanent: false,
    createdAt: now,
    expiresAt: now + blockTime * 1000
  });

  const ttl = Number.isFinite(status.ttlInSeconds) && status.ttlInSeconds > 0 ? status.ttlInSeconds : blockTime;
  const err = new Error(`Too Many Requests. Blocked for ${blockTime}s`);
  err.statusCode = 429;
  err.headers = { 'Retry-After': String(ttl) };
  throw err;
};

export { trackRequestCount, checkRateLimit };
