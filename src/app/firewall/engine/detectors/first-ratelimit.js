/**
 * 第一层速率限制
 * 注册 @fastify/rate-limit 插件，基于用户/IP 双维度限频。
 * 在 onRequest 阶段（认证之后）执行，被限流的请求直接拒绝。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import rateLimit from '@fastify/rate-limit';
import { createBoundStore } from '../../../../framework/redis/index.js';
import { getSecuritySettings } from '../../dao/dao.js';
import { resolveGeoInfo } from './geo-filter.js';
import { pushRecord } from '../../data/store.js';
import { createLogger } from '../../../../framework/log/index.js';

const log = createLogger('app.firewall.engine.detectors.first-ratelimit');

/**
 * 解析生效的限流阈值（配置值 + 环境变量旁路取较大者）
 *
 * `FW_RATE_LIMIT_OVERRIDE` 是**纯放宽**旁路：压测基线需要绕开持久化限流
 * （三个压测场景共用 127.0.0.1，默认 100/60s 的持久化限流会把压测打成 429），
 * 但绝不能让它变成收紧旁路 —— 所以只取 max(base, override)，且 override
 * 必须是严格正整数（0 / 负数 / 非数字 / 空串一律忽略，退回配置值）。
 *
 * @param {number|undefined} rateLimitRequests 安全设置里的 rateLimitRequests
 * @returns {number} 生效的 max
 */
function resolveRateLimitMax(rateLimitRequests) {
  const base = rateLimitRequests || 300;
  const override = Number.parseInt(process.env.FW_RATE_LIMIT_OVERRIDE, 10);
  if (Number.isInteger(override) && override > 0) {
    return Math.max(base, override);
  }
  return base;
}

/**
 * 注册速率限制插件
 * enableRateLimit 为 false 时跳过注册，不消耗任何资源。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
async function registerRateLimit(app) {
  const defense = getSecuritySettings().defense;
  if (!defense.enableRateLimit) return;

  try {
    await app.register(rateLimit, {
      global: true,
      store: createBoundStore(app, {
        getWindowMs: () => (getSecuritySettings().defense.rateLimitWindow || 60) * 1000
      }),
      continueExceeding: false,
      skipOnError: false,

      // 已登录用 user.id 限流，未登录用 IP 限流
      keyGenerator: req => {
        if (req.state?.user?.id) {
          return `rate:user:${req.state.user.id}`;
        }
        return `rate:ip:${req.ip}`;
      },

      max: () => resolveRateLimitMax(getSecuritySettings().defense.rateLimitRequests),
      timeWindow: () => (getSecuritySettings().defense.rateLimitWindow || 60) * 1000,

      errorResponseBuilder: (request, context) => {
        const ip = request.ip;
        request._firewallLogged = true;
        pushRecord({
          time: new Date().toISOString(),
          ip,
          userId: request.state?.user?.id || null,
          method: request.method,
          url: request.url,
          userAgent: request.headers['user-agent'] || '',
          blocked: true,
          statusCode: 429,
          ...resolveGeoInfo(ip)
        });
        // ⚠️ `statusCode` 是**必需**的：插件 v10 直接 `throw errorResponseBuilder(...)`，
        // Fastify 只认抛出的 Error/对象上的 `statusCode` 来决定 HTTP 状态。
        // 缺了它（旧实现只给 `code`）→ 限流命中会以 **500** 返回而不是 429，
        // 客户端看到的是服务端错误、且拿不到正确的语义。`code` 保留是因为
        // 本项目响应体契约用 `code`（前端与日志按此解析）。
        return {
          statusCode: 429,
          code: 429,
          error: 'Too Many Requests',
          message: `Your IP [${ip}] is temporary rate limited. Try again in ${context.after}.`
        };
      }
    });
  } catch (err) {
    log.warn('[Firewall] Rate Limit Plugin Failed:', err);
  }
}

export { registerRateLimit, resolveRateLimitMax };
