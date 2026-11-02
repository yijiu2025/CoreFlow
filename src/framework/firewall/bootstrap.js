/**
 * 防火墙核心装配插件（framework 层，防护能力的唯一定义点）
 *
 * 两层分离的收口（2026-11-02）：此前防护核心的钩子装配住在 app/firewall/index.js，
 * 由 05-firewall.js 间接启动 —— 「framework 的防护」却要经 app 的手才能装上。
 * 现在核心装配上移到这里，由 05-firewall.js **直接**注册；app/firewall 降级为
 * 可选扩展（配置持久化 / 面板遥测 / 邮件通道），删除 app 文件夹后防护核心
 * 仍以 framework 默认策略（config/defaults.js）运行 —— 可卸载语义更彻底。
 *
 * 注册顺序要求（05-firewall.js 负责编排）：
 *   ① app 侧 prepareAppFirewall()（initDao 注册配置读取器 + 加载磁盘配置）先行 ——
 *     registerRateLimit 在插件注册期读取 defense.enableRateLimit，晚读会拿默认值误判；
 *   ② 本插件（核心）；
 *   ③ app 侧 firewallAppPlugin（名单同步 / 遥测落盘）收尾。
 *
 * @author yijiu2025
 * @since 2026-11-02（自 app/firewall/index.js 的防护装配段原样上移）
 */
import fp from 'fastify-plugin';
import { createLogger } from '../log/index.js';
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
import { checkGlobalBlock } from './block-manager.js';
import { readSecuritySettings, hasSettingsReader, registerSettingsReader } from './interface/config-access.js';
import { DEFAULT_SECURITY_SETTINGS } from './config/defaults.js';

const log = createLogger('framework.firewall.bootstrap');

// 配置读取器兜底：app/firewall 在场时 dao.js 已在模块加载期注册读取器（读磁盘配置），
// 这里不覆盖；app 被卸载时用 framework 默认策略矩阵，保证防护核心独立可用。
// 注意：本模块被 05-firewall.js 静态 import，加载时机早于 loader 的 app 动态 import ——
// 因此 app 在场时这里会先短暂注册兜底、随后被 dao 的真实读取器覆盖（registerSettingsReader
// 的覆盖语义是刻意的），最终生效的仍是磁盘配置。
if (!hasSettingsReader()) {
  registerSettingsReader(() => DEFAULT_SECURITY_SETTINGS);
}

/**
 * 防火墙核心插件：@fastify/rate-limit 全局限频 + 五阶段拦截管道 + 观测钩子
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
const firewallCorePlugin = fp(async function (app) {
  // ============== 定时任务（僵尸连接清理） ==============
  startCleanupTask(app);

  // ============== 第一层速率限制（onRequest 阶段） ==============
  await registerRateLimit(app);

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
    if (readSecuritySettings().defense?.skipDeepCheckForAnonymous && willBeRejectedAsAnonymous(request)) return;

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
      // 检查 IP 是否被封禁
      try {
        await checkGlobalBlock(request.ip, null);
      } catch (err) {
        reply.code(403).send({ error: 'blocked', message: err.message });
      }
    }
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

export { firewallCorePlugin };
