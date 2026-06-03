/**
 * 第一层速率限制
 * 注册 @fastify/rate-limit 插件，基于用户/IP 双维度限频。
 * 在 onRequest 阶段（认证之后）执行，被限流的请求直接拒绝。
 */
import rateLimit from '@fastify/rate-limit';
import { createBoundStore } from '../../../../redis/resilient-store.js';
import { getSecuritySettings } from '../../dao/dao.js';
import { resolveGeoInfo } from './geo-filter.js';
import { pushRecord } from '../../data/store.js';

/**
 * 注册速率限制插件
 * enableRateLimit 为 false 时跳过注册，不消耗任何资源。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
export async function registerRateLimit(app) {
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
      keyGenerator: (req) => {
        if (req.state?.user?.id) {
          return `rate:user:${req.state.user.id}`;
        }
        return `rate:ip:${req.ip}`;
      },

      max: () => getSecuritySettings().defense.rateLimitRequests || 300,
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
        return {
          code: 429,
          error: 'Too Many Requests',
          message: `Your IP [${ip}] is temporary rate limited. Try again in ${context.after}.`
        };
      }
    });
  } catch (err) {
    console.warn('[Firewall] Rate Limit Plugin Failed:', err);
  }
}
