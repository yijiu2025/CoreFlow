/**
 * 应用工厂（入口门面）
 *
 * 只保留**启动编排**：校验配置 → 建实例 → 注册基础插件 → 挂错误处理器
 * → 启动加载器引擎 / 调度器 / 守卫配置同步 → 注册优雅关闭。
 *
 * 其余能力已按职责下沉（2026-11-07 拆分，本文件只做串联与顺序保证）：
 *   - 日志引导（唯一 configureLog 调用点）      → framework/startup/logging.js
 *   - 环境变量 / 调优配置体检                   → framework/startup/config-check.js
 *   - Fastify 构造参数（超时 / 日志 / reqId）    → framework/http/server-options.js
 *   - 基础插件注册（helmet/cors/upload/static…） → framework/http/plugins.js
 *   - 安全头与跨域策略                          → framework/http/security-options.js
 *   - 全局错误处理器                            → framework/http/error-handler.js
 *   - 代理可信网段解析与风险判定                 → utils/proxy-trust.js
 *   - CORS 来源解析与放行判断                    → utils/cors.js
 *
 * 拆分原则：能脱离 Fastify 实例与进程环境独立驱动的判据，一律不进入口 ——
 * 入口里的代码只能靠"起一个真服务"来验证，是最难测的位置。
 *
 * @author yijiu2025
 * @since 2026-07-22
 * @since 2026-11-07 瘦身为纯编排门面，通用能力下沉 framework/ 与 utils/
 */
import Fastify from 'fastify';

import { initLoader } from './framework/loader/index.js';
import { startScheduler } from './framework/scheduler/index.js';
import { startGuardConfigSync, stopGuardConfigSync, flushGuardConfig } from './api/guard-config.js';
import { closePubSub } from './framework/redis/index.js';
import { bootstrapLogging } from './framework/startup/logging.js';
import { checkEnvironment, reportAppConfigWarnings } from './framework/startup/config-check.js';
import { buildServerOptions } from './framework/http/server-options.js';
import { registerBasePlugins } from './framework/http/plugins.js';
import { createErrorHandler } from './framework/http/error-handler.js';
import { parseOriginList } from './utils/cors.js';
import { parseTrustProxy, describeProxyTrustRisk, formatProxyTrustRisks } from './utils/proxy-trust.js';

// 日志必须最先引导：后续所有模块的 createLogger 都读它的全局配置，
// 全局 log 与全局异常兜底也在这一步注册。
const log = bootstrapLogging();

// 运行调优配置校验（未知配置段/项、越界值只告警不阻断启动）。
// 放在 log 之后、任何消费之前 —— 配置问题要在启动日志里一眼可见。
reportAppConfigWarnings();

// 应用层不信任任意代理 IP，仅允许本地回环。
// 生产环境若有反向代理（Nginx / Cloudflare / ALB），通过 PROXY_TRUST_CIDR 指定**确切地址**。
const trustProxy = parseTrustProxy(process.env.PROXY_TRUST_CIDR);

// 过宽网段会让 IP 白名单 / 限流 / 封禁同时失效且无任何报错 —— 启动即告警
const proxyRisks = describeProxyTrustRisk(trustProxy);
if (proxyRisks.length > 0) {
  log.warn(formatProxyTrustRisks(proxyRisks));
}

// 启动时解析 CORS 白名单，避免每次请求重复解析环境变量
const CORS_ORIGINS = parseOriginList(process.env.CORS_ORIGINS);

/**
 * 创建并配置 Fastify 应用实例
 *
 * 顺序即依赖：配置体检 → 建实例 → 基础插件 → 错误处理器 → 引擎 → 调度器
 * → 守卫配置同步 → 关闭钩子。
 *
 * @returns {Promise<import('fastify').FastifyInstance>} 配置完成的 Fastify 实例
 * @throws {Error} 环境变量校验失败时（进程已安排退出）抛出，立即中断启动
 */
async function createApp() {
  const isProduction = process.env.NODE_ENV === 'production';

  // 配置错误必须在**建立任何连接之前**暴露，而不是等某个功能在运行期静默失效。
  if (!checkEnvironment(isProduction)) {
    // 已安排 process.exit；抛出是为了立刻中断启动流程，
    // 避免在等待退出的 100ms 里又去连数据库、注册路由
    throw new Error('环境变量校验失败，启动已中止');
  }

  // 生产环境未配置白名单时记录警告，避免运维人员误以为跨域请求可以正常访问
  if (isProduction && CORS_ORIGINS.length === 0) {
    log.warn('⚠️ [App] 生产环境未配置 CORS_ORIGINS，所有跨域请求将被拒绝。请在 .env 中设置允许的来源（逗号分隔）');
  }

  const app = Fastify(buildServerOptions({ isProduction, trustProxy }));

  // 基础插件按依赖顺序注册（security → cors → file → ws → cookie）
  await registerBasePlugins(app, { isProduction, corsOrigins: CORS_ORIGINS });

  // 全局错误处理：统一响应格式，生产环境隐藏堆栈与内部错误原文
  app.setErrorHandler(createErrorHandler(isProduction));

  // 启动加载器引擎，按顺序初始化 Redis → DB → Auth → Firewall → Models → API → Apps
  await initLoader(app);

  // 启动定时任务调度器（session_tokens 清理等，频率从 data/scheduler_config.json 读）
  // scheduler 内部注册 onClose 钩子清理定时器，不阻塞启动
  await startScheduler(app);

  // 启动跨实例守卫配置同步。
  // 守卫配置是**模块级单例**，运行期修改只影响处理该请求的实例 ——
  // 不同步的话，同一路由打到不同实例会得到不同鉴权结果（安全语义错误，而非可用性问题）。
  // 必须在 initLoader（内部已调用 loadGuardConfig 完成首次加载）之后启动。
  startGuardConfigSync();

  registerShutdownHooks(app);

  return app;
}

/**
 * 注册优雅关闭钩子
 *
 * 两件事都必须显式做，否则进程无法自然退出或丢配置：
 *   ① 防抖中的守卫配置要在退出前落库（Fastify onClose 不暴露异步错误，必须自捕获）
 *   ② Redis Pub/Sub 派生的订阅连接要 quit（否则事件循环上永远有个活句柄）
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @returns {void}
 */
function registerShutdownHooks(app) {
  app.addHook('onClose', async () => {
    stopGuardConfigSync();
    try {
      await flushGuardConfig();
    } catch (err) {
      log.error(`❌ [App] 优雅关闭时保存守卫配置失败`, err);
    }

    try {
      await closePubSub();
    } catch (err) {
      log.error(`❌ [App] 优雅关闭时关闭 Pub/Sub 失败`, err);
    }
  });
}

// createErrorHandler / describeProxyTrustRisk 一并再导出：既有测试与脚本按入口路径导入，
// 保持门面契约不因拆分而断裂（实现本体已迁至 framework/http 与 utils/）。
export { createApp, createErrorHandler, describeProxyTrustRisk, registerShutdownHooks };
