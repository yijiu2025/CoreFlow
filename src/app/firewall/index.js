/**
 * 防火墙核心模块
 * Fastify 插件入口：注册速率限制、同步名单、挂载生命周期钩子
 * 安全检测逻辑委托给 engine/pipeline.js
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import {
  initDao,
  syncManualBlacklistToRedis,
  syncManualWhitelistToRedis,
  cleanupSaveTimer,
  getSecuritySettings
} from './dao/dao.js';
import {
  shouldSkipDeepCheck,
  willBeRejectedAsAnonymous,
  buildRequestContext,
  checkGlobalBlockPhase,
  checkChallengeCookie,
  runDetectionPipeline,
  observeLoginOutcome,
  recordLog
} from './engine/index.js';
import { registerRateLimit } from './engine/detectors/first-ratelimit.js';
import { checkNotFoundTrap } from './engine/detectors/scan-trap.js';
import { startCleanupTask, trackConnection } from './util/connection-tracker.js';
import { flushPersist } from './data/store.js';
import fp from 'fastify-plugin';
import { createLogger } from '../../framework/log/index.js';

const log = createLogger('app.firewall.index');

/**
 * 初始化防火墙插件
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
const initFirewall = fp(async function (app) {
  // ============== 加载持久化配置（必须在任何读取配置的动作之前） ==============
  // dao.js 的 initDao 注释写着「由 index.js 在插件注册时调用」，但服务端从未调用过它：
  // securitySettings 一直是 DEFAULT_SECURITY_SETTINGS 的内存副本，磁盘上
  // firewall_config.json 里的 enableRateLimit / 手动黑白名单**从未被加载**，
  // 而 updateSecuritySettings 触发的 triggerSave 又会用默认值把磁盘文件覆盖掉。
  // 顺序很关键：必须在 registerRateLimit / sync* 之前，否则它们读到的还是默认值。
  initDao();

  // ============== 定时任务 ==============
  startCleanupTask(app);

  // ============== 第一层速率限制（onRequest 阶段） ==============
  await registerRateLimit(app);

  // ============== 启动时同步名单（访问层自行判断 Redis 是否可用） ==============
  await syncManualBlacklistToRedis();
  await syncManualWhitelistToRedis();

  // ============== onRequest：安全检查管道 ==============

  app.addHook('onRequest', async (request, reply) => {
    const { ip, ua, fingerprint, deviceId } = await buildRequestContext(request);

    // 第 1 阶段：全局封禁检查（连接数 + 黑名单 + 挑战态）
    const blocked = await checkGlobalBlockPhase(request, reply);
    if (blocked) {
      request._firewallLogged = true;
      return;
    }

    // 跳过静态资源和挑战验证接口
    if (shouldSkipDeepCheck(request.url)) return;

    // 已知会被守卫拒绝的匿名请求：连挑战 Cookie 校验与深度检测一起跳过
    // （配置开关 skipDeepCheckForAnonymous，默认关闭；取舍见 willBeRejectedAsAnonymous 注释）
    if (getSecuritySettings().defense?.skipDeepCheckForAnonymous && willBeRejectedAsAnonymous(request)) return;

    // 第 2 阶段：挑战 Cookie 验证（已通过的直接放行）
    const passed = await checkChallengeCookie(request, ip, fingerprint);
    if (passed) return;

    // 第 3 阶段：深度检测管道（Bot / 地理信誉 / 端点限频）
    const intercepted = await runDetectionPipeline(
      ip,
      ua,
      request.url,
      request._firewallLog,
      fingerprint,
      reply,
      deviceId
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

  // ============== WebSocket 握手防护 ==============
  app.addHook('onRequest', async (request, reply) => {
    // WebSocket 升级请求也经过基本安全检查
    if (request.headers.upgrade === 'websocket') {
      const ip = request.ip;
      const { checkGlobalBlock } = await import('./dao/block-manager.js');

      // 检查 IP 是否被封禁
      try {
        await checkGlobalBlock(ip, null);
      } catch (err) {
        reply.code(403).send({ error: 'blocked', message: err.message });
      }
    }
  });

  // ============== onClose：清理定时器 + 落盘遥测 ==============
  app.addHook('onClose', async () => {
    cleanupSaveTimer();
    // 遥测只在内存里，滚动发布 / 重启时不落盘就会丢掉最近的统计
    await flushPersist();
  });

  // ============== onResponse：登录结果观测 + 扫描陷阱 ==============

  app.addHook('onResponse', async (request, reply) => {
    // 暴力破解防护的接线点：在响应阶段观测登录结果（firewall 自己观测，不反向依赖 oauth21）
    await observeLoginOutcome(request, reply);

    if ([404, 403].includes(reply.statusCode)) {
      try {
        await checkNotFoundTrap(request.ip, request.url, reply.statusCode, request._deviceId || null);
      } catch (err) {
        log.warn(`[Firewall] Trap Triggered: ${request.ip} -> ${err.rule}`);
      }
    }
  });
});

export { initFirewall };
