/**
 * 第一层速率限制
 * 注册 @fastify/rate-limit 插件，基于用户/IP 双维度限频。
 * 在 onRequest 阶段（认证之后）执行，被限流的请求直接拒绝。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import rateLimit from '@fastify/rate-limit';
import { createBoundStore } from '../../../redis/index.js';
import { readSecuritySettings } from '../../interface/config-access.js';
import { resolveGeoInfo } from './geo-filter.js';
import { recordFirewallEvent } from '../../telemetry-sink.js';
import { createLogger } from '../../../log/index.js';

const log = createLogger('framework.firewall.engine.detectors.first-ratelimit');

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
 *   1. `defense.enableRateLimit=false` **且** `defense.enableEndpointRateLimit=false`
 *      → 插件**根本不注册**，而全仓 14 处端点级 `config.rateLimit: { max, timeWindow, groupId }`
 *      是 @fastify/rate-limit 的 onRoute 钩子消费的，插件不在就等于这些声明全部失效
 *      （Fastify 不校验未知的 route config，连警告都没有）；
 *   2. 全局阈值高到没有意义（曾被配成 10000 次/60 秒 ≈ 166 rps/键）。
 *
 * ⚠️ 2026-11-02 语义变更：插件改为**始终注册**（`global` 只跟随 `enableRateLimit`），
 * 因此「只关全局」不再等于「端点声明也失效」—— 只有两套开关都关才会全部失效。
 * 原先这里对 `enableRateLimit=false` 一律报「全部失效」，那句话在改造后就是错的。
 *
 * @param {object} cfg
 * @param {boolean} cfg.enabled - defense.enableRateLimit（是否启用**全局**桶）
 * @param {number} cfg.max - 生效阈值（已含 FW_RATE_LIMIT_OVERRIDE 旁路）
 * @param {number} cfg.windowSec - 窗口秒数
 * @param {boolean} [cfg.routeLevel] - 端点级声明是否仍生效（enableEndpointRateLimit !== false）
 * @returns {string|null} 风险说明；null 表示没有需要告警的配置
 */
function describeRateLimitRisk({ enabled, max, windowSec, routeLevel = false }) {
  if (!enabled) {
    // 全局关、端点级仍生效：这是「只按端点声明限流」的正常形态，不是风险
    if (routeLevel) return null;
    return (
      '全局限流与端点级限频均已关闭（defense.enableRateLimit=false 且 defense.enableEndpointRateLimit=false）：' +
      '@fastify/rate-limit 不会注册，所有路由上声明的 config.rateLimit（登录/注册/改密/重置等）**全部失效**。'
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
 *
 * 两个开关分管两件事（2026-11-02 修：此前全局关 = 插件不注册 = 端点声明全废）：
 *   · `defense.enableRateLimit`         → 是否给**所有**路由加全局桶（`global`）
 *   · `defense.enableEndpointRateLimit` → 是否让各端点声明的 `config.rateLimit` 生效
 *
 * 插件必须**尽量注册**：`config.rateLimit` 由插件的 onRoute 钩子消费，插件不注册时
 * 全仓 14 处声明（含 h5-token 的 groupId 计数隔离）会**静默失效** —— Fastify 对未知的
 * route config 不校验、不警告。因此：
 *   · 只关全局 → 仍注册（`global: false`），端点级限流继续按声明生效；
 *   · 只关端点级 → 仍注册（若全局开），并在注册前摘掉路由上的 `config.rateLimit`；
 *   · 两个都关 → 不注册，并在启动日志明确告警（真正的"完全不限流"）。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
async function registerRateLimit(app) {
  const settings = readSecuritySettings() || {};
  const defense = settings.defense || {};

  // 写在 securitySettings 顶层的 defense 键（如历史遗留的 enableRateLimit）会在载入时
  // 被剔除并告警一次（config/validate.js）；这里只认 defense.* 的生效值。

  const globalEnabled = Boolean(defense.enableRateLimit);
  const routeLevelEnabled = defense.enableEndpointRateLimit !== false;

  if (!globalEnabled && !routeLevelEnabled) {
    log.warn(`⚠️ [Firewall] ${describeRateLimitRisk({ enabled: false, max: 0, windowSec: 0, routeLevel: false })}`);
    return;
  }

  const effectiveMax = resolveRateLimitMax(defense.rateLimitRequests);
  const effectiveWindow = defense.rateLimitWindow || 60;
  const risk = describeRateLimitRisk({
    enabled: globalEnabled,
    max: effectiveMax,
    windowSec: effectiveWindow,
    routeLevel: routeLevelEnabled
  });
  if (risk) {
    log.warn(`⚠️ [Firewall] ${risk}`);
  } else if (globalEnabled) {
    log.info(`[Firewall] 全局限流已启用：${effectiveMax} 次/${effectiveWindow}s（按用户或 IP）`);
  } else {
    log.info('[Firewall] 全局限流未启用；各端点声明的 config.rateLimit 仍按声明生效（enableEndpointRateLimit=true）');
  }

  // 端点级明确关闭时：必须在插件注册**之前**摘掉路由配置。
  // 否则 global=true 必须注册插件，而插件一在，onRoute 就会消费这些声明 ——
  // 「关了端点级却还在限」比「完全没限」更难排查。
  if (!routeLevelEnabled) {
    app.addHook('onRoute', routeOptions => {
      if (routeOptions.config?.rateLimit !== undefined) {
        delete routeOptions.config.rateLimit;
      }
    });
    log.info('[Firewall] 端点级限频已关闭（enableEndpointRateLimit=false）：路由上的 config.rateLimit 一律忽略');
  }

  try {
    await app.register(rateLimit, {
      // 只决定「没有 config.rateLimit 的路由是否也限」；端点声明不受此开关影响
      global: globalEnabled,
      store: createBoundStore(app, {
        getWindowMs: () => (readSecuritySettings().defense.rateLimitWindow || 60) * 1000
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

      max: () => resolveRateLimitMax(readSecuritySettings().defense.rateLimitRequests),
      timeWindow: () => (readSecuritySettings().defense.rateLimitWindow || 60) * 1000,

      errorResponseBuilder: (request, context) => {
        const ip = request.ip;
        request._firewallLogged = true;
        recordFirewallEvent({
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
