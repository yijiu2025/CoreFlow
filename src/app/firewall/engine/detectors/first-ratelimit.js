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
  const raw = process.env.FW_RATE_LIMIT_OVERRIDE;
  if (raw !== undefined && String(raw).trim() !== '') {
    // Number 而非 parseInt：'10.5' / '12abc' 这类输入必须被拒收，
    // 静默截断会让「看起来配了 10.5」实际生效成 10
    const override = Number(raw);
    if (Number.isInteger(override) && override > 0) {
      return Math.max(base, override);
    }
  }
  return base;
}

/**
 * 判定当前限流配置是否"看起来开了、实际不构成防护"
 *
 * 存在的理由：`registerRateLimit` 有两个静默失败模式，线上从日志里看不出来 ——
 *   1. `defense.enableRateLimit=false` → 插件**根本不注册**，而全仓 13 处端点级
 *      `config.rateLimit: { max, timeWindow }` 是 @fastify/rate-limit 的 onRoute 钩子消费的，
 *      插件不在就等于这些声明全部失效（Fastify 不校验未知的 route config，连警告都没有）；
 *   2. 阈值高到没有意义（曾被配成 10000 次/60 秒 ≈ 166 rps/键）。
 *
 * @param {object} cfg
 * @param {boolean} cfg.enabled - defense.enableRateLimit
 * @param {number} cfg.max - 生效阈值（已含 FW_RATE_LIMIT_OVERRIDE 旁路）
 * @param {number} cfg.windowSec - 窗口秒数
 * @returns {string|null} 风险说明；null 表示配置有效
 */
function describeRateLimitRisk({ enabled, max, windowSec }) {
  if (!enabled) {
    return (
      '全局限流未启用（defense.enableRateLimit=false）：@fastify/rate-limit 不会注册，' +
      '所有路由上声明的 config.rateLimit（登录/注册/改密/重置等）**全部失效**。'
    );
  }
  if (!Number.isFinite(max) || max <= 0) {
    return `全局限流阈值非法（${max}），插件会按"永不超限"运行`;
  }
  if (max > 1000) {
    const rps = windowSec > 0 ? Math.round(max / windowSec) : max;
    return `全局限流阈值 ${max} 次/${windowSec}s（约 ${rps} rps/键）过高，单 IP 打这么多请求已足以压垮进程，基本不构成防护`;
  }
  return null;
}

/**
 * 注册速率限制插件
 * enableRateLimit 为 false 时跳过注册，不消耗任何资源。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
async function registerRateLimit(app) {
  const settings = getSecuritySettings() || {};
  const defense = settings.defense || {};

  // 历史遗留：securitySettings 顶层曾经也有一份扁平的同名字段（enableRateLimit /
  // rateLimitRequests / rateLimitWindow），取值与 defense.* 不一致，且**没有任何代码读它**。
  // 出厂 JSON 已清理，但现场实例的配置文件未必被替换 —— 这里把它喊出来，避免运维看着 60
  // 以为在限流、实际生效 10000。
  const legacyFlat = ['enableRateLimit', 'rateLimitRequests', 'rateLimitWindow'].filter(
    key => key in settings && !(key in defense)
  );
  if (legacyFlat.length > 0) {
    log.warn(
      `⚠️ [Firewall] 配置文件 securitySettings 下存在已废弃的扁平限流字段（${legacyFlat.join(', ')}），` +
        `它们**不会被读取**，生效值是 defense.*。请删除这些字段以免误判。`
    );
  }

  if (!defense.enableRateLimit) {
    log.warn(`⚠️ [Firewall] ${describeRateLimitRisk({ enabled: false, max: 0, windowSec: 0 })}`);
    return;
  }

  const effectiveMax = resolveRateLimitMax(defense.rateLimitRequests);
  const effectiveWindow = defense.rateLimitWindow || 60;
  const risk = describeRateLimitRisk({ enabled: true, max: effectiveMax, windowSec: effectiveWindow });
  if (risk) log.warn(`⚠️ [Firewall] ${risk}`);
  else log.info(`[Firewall] 全局限流已启用：${effectiveMax} 次/${effectiveWindow}s（按用户或 IP）`);

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

export { registerRateLimit, resolveRateLimitMax, describeRateLimitRisk };
