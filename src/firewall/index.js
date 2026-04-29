/**
 * 防火墙核心模块
 * 负责初始化各种安全策略，包括速率限制、僵尸网络挑战、地理位置信誉检查等。
 */
import rateLimit from '@fastify/rate-limit';
import { ResilientStore } from './utils/resilient-store.js';
import { safeRedis } from './utils/util.js';
import { getSecuritySettings, syncManualBlacklistToRedis, syncManualWhitelistToRedis } from './dao/dao.js';
import { buildChallengePage } from './challenge-template.js';
import {
  checkRateLimit,
  checkNotFoundTrap,
  trackConnection,
  checkGeoReputation,
  checkBotChallenge,
  trackRequestCount,
  cleanupStaleConnections,
  resolveGeoInfo,
  checkGlobalBlock
} from './detector.js';
import { pushRecord } from './store.js';
import fp from 'fastify-plugin';

/**
 * 初始化防火墙插件
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
export const initFirewall = fp(async function (app) {
  // 定期清理过期的连接记录
  const cleanupTimer = setInterval(
    () => {
      cleanupStaleConnections();
    },
    5 * 60 * 1000
  );

  // 注册 onClose 钩子，清理定时器
  app.addHook('onClose', async () => {
    clearInterval(cleanupTimer);
  });

  // 定义绑定到当前 app 实例的存储类
  const BoundStore = class extends ResilientStore {
    constructor(options) {
      super(app, options);
    }
  };

  // 注册全局速率限制插件
  await app.register(rateLimit, {
    global: true,
    store: BoundStore,
    continueExceeding: false,
    skipOnError: false,
    keyGenerator: (req) => req.ip,
    max: () => getSecuritySettings().defense.rateLimitRequests || 300,
    timeWindow: () => (getSecuritySettings().defense.rateLimitWindow || 60) * 1000,
    errorResponseBuilder: (request, context) => {
      const ip = request.ip;
      request._firewallLogged = true;
      pushRecord({
        time: new Date().toISOString(),
        ip,
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

  // 启动时同步手动名单到 Redis
  await syncManualBlacklistToRedis(app.redis);
  await syncManualWhitelistToRedis(app.redis);

  // 请求进入钩子：执行核心安全检查
  app.addHook('onRequest', async (request, reply) => {
    const ip = request.ip;
    const url = request.url;
    const ua = request.headers['user-agent'] || '';

    const geoInfo = resolveGeoInfo(ip);
    request._firewallLog = {
      time: new Date().toISOString(),
      ip,
      method: request.method,
      url: request.url,
      userAgent: ua,
      blocked: false,
      ...geoInfo
    };

    try {
      // 1. 检查连接并发数
      trackConnection(ip, 1);
      // 2. 检查全局黑名单状态 (解决拦截不及时的问题)
      await checkGlobalBlock(app.redis, ip);
    } catch (err) {
      request._firewallLog.blocked = true;
      request._firewallLog.statusCode = err.statusCode || 429;
      request._firewallLogged = true; // 标记已记录，防止 onSend 重复
      pushRecord({ ...request._firewallLog });
      return reply.code(err.statusCode || 429).send({ error: 'Security Policy Blocked', message: err.message });
    }

    if (url === '/api/firewall/v1/challenge/verify') return;
    if (/\.(js|css|png|jpg|ico|svg|woff2?)$/i.test(url)) return;

    const clientToken = request.cookies?.fw_verified;
    if (clientToken) {
      const isPassed = await safeRedis(app.redis, (r) => r.exists(`fw:pass:${ip}:${clientToken}`));
      if (isPassed) return;
    }

    try {
      const requestCount = trackRequestCount(ip);
      const isBot = await checkBotChallenge(app.redis, ip, ua, requestCount);

      if (isBot) {
        const err = new Error('CHALLENGE');
        err.isChallenge = true;
        throw err;
      }

      await safeRedis(app.redis, (r) => checkGeoReputation(r, ip, url));

      if (url.includes('/api/sms')) {
        await checkRateLimit(app.redis, `SMS:${ip}`, { limit: 3, window: 600, blockTime: 1800 });
      } else if (url.includes('/api/order')) {
        await checkRateLimit(app.redis, `ORDER:${ip}`, { limit: 10, window: 60, blockTime: 1800 });
      }
    } catch (err) {
      const isChallenge = err.isChallenge || err.message?.includes('CHALLENGE');
      request._firewallLog.blocked = true;
      request._firewallLog.statusCode = isChallenge ? 200 : err.statusCode || 429;
      request._firewallLogged = true;
      pushRecord({ ...request._firewallLog });

      if (isChallenge) return reply.type('text/html').send(buildChallengePage(ip));
      if (err.headers) reply.headers(err.headers);
      return reply.code(err.statusCode || 429).send({ error: 'Security Policy Blocked', message: err.message });
    }
  });

  // 发送响应钩子：更新连接统计并记录日志
  app.addHook('onSend', async (request, reply, payload) => {
    trackConnection(request.ip, -1);
    if (request._firewallLog && !request._firewallLogged) {
      pushRecord({ ...request._firewallLog, statusCode: reply.statusCode });
    }
    return payload;
  });

  // 响应完成钩子：用于触发蜜罐/陷阱逻辑（如 404 扫描检测）
  app.addHook('onResponse', async (request, reply) => {
    if ([404, 403].includes(reply.statusCode)) {
      try {
        await checkNotFoundTrap(app.redis, request.ip, request.url, reply.statusCode);
      } catch (err) {
        // 仅在控制台记录，不再重复 pushRecord
        console.warn(`[Firewall] Trap Triggered: ${request.ip} -> ${err.rule}`);
      }
    }
  });
});
