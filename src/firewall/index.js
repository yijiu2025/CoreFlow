/**
 * 防火墙核心模块
 * Fastify 插件入口：注册速率限制、同步名单、挂载生命周期钩子
 * 安全检测逻辑委托给 engine/pipeline.js
 */
import { syncManualBlacklistToRedis, syncManualWhitelistToRedis } from './dao/dao.js';
import {
  startCleanupTask,
  trackConnection,
  shouldSkipDeepCheck,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  recordLog
} from './engine/index.js';
import { registerRateLimit } from './engine/detectors/first-ratelimit.js';
import { checkNotFoundTrap } from './engine/detectors/scan-trap.js';
import fp from 'fastify-plugin';

/**
 * 初始化防火墙插件
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
export const initFirewall = fp(async function (app) {
  // ============== 定时任务 ==============
  startCleanupTask(app);

  // ============== 第一层速率限制（onRequest 阶段） ==============
  await registerRateLimit(app);

  // ============== 启动时同步名单 ==============
  await syncManualBlacklistToRedis(app.redis);
  await syncManualWhitelistToRedis(app.redis);

  // ============== onRequest：安全检查管道 ==============

  app.addHook('onRequest', async (request, reply) => {
    const { ip, ua, fingerprint } = buildRequestContext(request);

    // 第 1 阶段：全局封禁检查（连接数 + 黑名单）
    const blocked = await checkGlobalBlockPhase(app.redis, ip, fingerprint, request._firewallLog, reply);
    if (blocked) {
      request._firewallLogged = true;
      return;
    }

    // 跳过静态资源和挑战验证接口
    if (shouldSkipDeepCheck(request.url)) return;

    // 第 2 阶段：挑战 Cookie 验证（已通过的直接放行）
    const passed = await checkChallengeCookie(app.redis, request, ip, fingerprint);
    if (passed) return;

    // 第 3 阶段：深度检测管道（Bot / 地理信誉 / 端点限频）
    const intercepted = await runDetectionPipeline(
      app.redis,
      ip,
      ua,
      request.url,
      request._firewallLog,
      fingerprint,
      reply
    );
    if (intercepted) {
      request._firewallLogged = true;
    }
  });

  // ============== onSend：记录日志 + 释放连接 ==============

  app.addHook('onSend', async (request, reply, payload) => {
    trackConnection(request.ip, -1);
    recordLog(request._firewallLog, reply.statusCode, request._firewallLogged);
    return payload;
  });

  // ============== onResponse：扫描陷阱 ==============

  app.addHook('onResponse', async (request, reply) => {
    if ([404, 403].includes(reply.statusCode)) {
      try {
        await checkNotFoundTrap(app.redis, request.ip, request.url, reply.statusCode);
      } catch (err) {
        console.warn(`[Firewall] Trap Triggered: ${request.ip} -> ${err.rule}`);
      }
    }
  });
});
