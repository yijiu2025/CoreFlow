/**
 * 敏感接口限频中间件
 *
 * 基于 IP 的滑动窗口限频：登录、邮箱二次验证、注册、扫码确认。
 * Redis Sorted Set 实现，Redis 不可用时降级到进程内 Map（单实例语义，仅兜底）。
 *
 * 🔴 作用域与匹配方式（U21 修订）
 *
 * 旧实现在 `init` 里 `addHook`，而 `init` 运行在封装子作用域，覆盖不到根作用域的业务路由
 * —— 也就是说**从未生效**。同时它按 `url.includes('/login')` 做子串匹配，一旦真的接到根作用域，
 * `/user/v1/register`、任何含 `/login` 的路径都会被一并限流（误伤其他前端）。
 *
 * 现在：
 *   - 用 `fp` + `rootPlugins` 注册到**根作用域**；
 *   - 只处理 `/oauth2.1` 前缀（`/oauth2.10` 不误命中）；
 *   - 规则用**精确路径**匹配，不做子串包含。
 *
 * 阈值刻意保守但可用（同一 NAT 出口的多人共用一份配额）：
 *   登录 5 次/分、邮箱二次验证 5 次/分、扫码确认 10 次/分、iframe 注册入口 3 次/时。
 * 触发时返回 429 + `Retry-After`，前端应提示"稍后再试"而不是当成登录失败。
 *
 * ⚠️ 本插件只作用于 `/oauth2.1` 前缀。user 域的 `POST /user/v1/register` 由该路由自己的
 *    `config.rateLimit`（5 次/分/IP）拦住 —— 「注册 3 次/时」这个说法在本文件里**已经不成立**，
 *    文档若再这么写就是错的。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 根作用域 + 前缀闸门 + 精确路径匹配（U21）
 */
import fp from 'fastify-plugin';
import { globalRedis } from '../../../framework/redis/plugin.js';

/** 作用域前缀（`/oauth2.10` 不误命中） */
const OAUTH21_SCOPE_PREFIX = '/oauth2.1';

/** 内存降级上限，防止 DoS 耗尽内存 */
const MEMORY_MAX = 100000;

/** 内存清理间隔（毫秒） */
const MEMORY_CLEANUP_INTERVAL = 60_000;

/** 进程内降级存储 */
const memoryStore = new Map();

/** 单调递增序号：保证 Sorted Set 的 member 唯一 */
let seq = 0;

// 定期清理过期条目，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memoryStore) {
    if (v.expires < now) memoryStore.delete(k);
  }
  // 仍超上限则淘汰一半最早过期条目
  if (memoryStore.size > MEMORY_MAX) {
    const toDelete = Math.floor(memoryStore.size / 2);
    const entries = [...memoryStore.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < toDelete; i++) {
      memoryStore.delete(entries[i][0]);
    }
  }
}, MEMORY_CLEANUP_INTERVAL).unref();

/**
 * 限频规则表
 *
 * `paths` 是**精确路径数组**（含 `/oauth2.1` 前缀，一条规则可覆盖多个真实端点）。
 * `windowSec` 是窗口长度。
 *
 * 🔴 每条路径都必须是**真实存在的路由**：本中间件按 `request.url` 精确比对，写错的路径
 * 不会报错、不会告警，只会让那条规则永远不命中 —— 等于这条限频从未存在。
 * 历史实现里 `{ name: 'register', path: '/oauth2.1/register' }` 就是这样一条死规则：
 * 全仓没有 `/oauth2.1/register` 这条路由（真实注册在 user 域 `POST /user/v1/register`，
 * 由该路由自己的 `config.rateLimit` 兜住），于是"注册 3 次/时"从未生效。
 * 现由 `src/__tests__/security/rate-limit-rules.test.js` 逐条比对真实路由表兜底。
 */
const RATE_LIMIT_RULES = [
  { name: 'login', paths: ['/oauth2.1/login'], maxRequests: 5, windowSec: 60 },
  { name: 'miniLogin', paths: ['/oauth2.1/mini-login'], maxRequests: 5, windowSec: 60 },
  { name: 'verifyEmail', paths: ['/oauth2.1/login/verify-email'], maxRequests: 5, windowSec: 60 },
  { name: 'qrConfirm', paths: ['/oauth2.1/qr/confirm'], maxRequests: 10, windowSec: 60 },
  // oauth21 只提供 iframe 嵌入入口（stub），真正的注册在 user 域；这里仍限住，
  // 避免它被当成免费的 201 探针反复调用。
  { name: 'miniRegister', paths: ['/oauth2.1/mini-register'], maxRequests: 3, windowSec: 3600 }
];

/** 按精确路径取规则（`null` = 不限频） */
function matchRule(pathname) {
  return RATE_LIMIT_RULES.find(rule => rule.paths.includes(pathname)) || null;
}

/** 请求是否属于 oauth21 作用域 */
function isOAuth21Request(url = '') {
  const pathname = url.split('?')[0];
  return pathname === OAUTH21_SCOPE_PREFIX || pathname.startsWith(`${OAUTH21_SCOPE_PREFIX}/`);
}

/**
 * 创建 IP 限频器
 *
 * Redis 客户端在每次调用时惰性解析（`globalRedis`）：插件启动时是带重试的异步连接，
 * 若在注册时捕获快照，Redis 就绪前的请求会永久走内存降级直到重启。
 *
 * @param {string} prefix - 限频 key 前缀
 * @param {number} maxRequests - 窗口内最大请求数
 * @param {number} windowSec - 窗口时间（秒）
 * @returns {(ip: string) => Promise<{allowed: boolean, retryAfter?: number}>}
 */
function createIpRateLimiter(prefix, maxRequests, windowSec) {
  return async function checkRateLimit(ip) {
    const key = `rl:${prefix}:${ip}`;
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const redis = globalRedis;

    if (redis) {
      try {
        // 滑窗：移除窗口外的记录，计数窗口内的记录
        await redis.zRemRangeByScore(key, 0, now - windowMs);
        const count = await redis.zCard(key);

        if (count >= maxRequests) {
          const oldest = await redis.zRange(key, 0, 0, { REV: false });
          const retryAfter = oldest.length > 0 ? Math.ceil((parseInt(oldest[0]) + windowMs - now) / 1000) : windowSec;
          return { allowed: false, retryAfter };
        }

        // member 必须唯一：同一毫秒的两次请求若 member 相同，zAdd 会覆盖而不是累加（少算）
        await redis.zAdd(key, { score: now, value: `${now}-${++seq}` });
        await redis.expire(key, windowSec);
        return { allowed: true };
      } catch {
        // Redis 故障 → 走下面的内存兜底，不因为限频器把登录整体打挂
      }
    }

    // 内存降级（单实例语义）
    let record = memoryStore.get(key);
    if (!record || record.expires < now) {
      record = { count: 0, expires: now + windowMs };
    }
    record.count++;
    memoryStore.set(key, record);

    if (record.count > maxRequests) {
      return { allowed: false, retryAfter: Math.ceil((record.expires - now) / 1000) };
    }
    return { allowed: true };
  };
}

/** 规则名 → 限频器（进程内单例，避免每次请求重建 Map key 前缀） */
const limiters = new Map(
  RATE_LIMIT_RULES.map(rule => [rule.name, createIpRateLimiter(rule.name, rule.maxRequests, rule.windowSec)])
);

/**
 * 敏感接口限频插件（根作用域）
 *
 * @param {object} app - Fastify 实例
 */
const sensitiveRateLimitPlugin = fp(async function sensitiveRateLimits(app) {
  app.addHook('onRequest', async (request, reply) => {
    if (!isOAuth21Request(request.url)) return;

    const pathname = request.url.split('?')[0];
    const rule = matchRule(pathname);
    if (!rule) return;

    const limiter = limiters.get(rule.name);
    if (!limiter) return;
    const result = await limiter(request.ip);
    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfter);
      return reply.code(429).send({
        code: 429,
        message: `请求过于频繁，请在 ${result.retryAfter} 秒后重试`,
        data: null
      });
    }
  });
});

export { createIpRateLimiter, sensitiveRateLimitPlugin, matchRule, isOAuth21Request, RATE_LIMIT_RULES, memoryStore };
