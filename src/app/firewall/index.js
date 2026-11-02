/**
 * firewall 应用装配（app 层 = 面板/配置/遥测扩展）
 *
 * 两层分离后的职责边界（2026-11-02）：
 *   - 防护核心（限流插件 + 五阶段管道 + 观测钩子）在 framework/firewall/bootstrap.js，
 *     由 framework/loader/registry/05-firewall.js 直接注册 —— 本文件不再装配任何防护钩子；
 *   - 本模块只提供 app 侧的三件事：
 *       ① prepareAppFirewall：配置持久化（initDao）+ 邮件告警通道注入
 *          （遥测 sink 在 data/store.js 模块体注册，import 本模块即生效）；
 *       ② firewallAppPlugin：手动名单同步 + onClose 遥测落盘/定时器清理；
 *       ③ initFirewall：①+核心+② 的完整组合，**仅供测试**在裸 Fastify 上一键装齐
 *          （生产注册点在 05-firewall.js 分步编排，勿新增第三条注册路径）。
 *   - firewall 应用被卸载（本文件夹删除）时，05-firewall 跳过 ①③，
 *     防护核心以 framework 默认策略独立运行。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-02 防护装配上移 framework/firewall/bootstrap.js，本文件只留扩展层
 */
import { initDao, syncManualBlacklistToRedis, syncManualWhitelistToRedis, cleanupSaveTimer } from './dao/dao.js';
import { registerEmailAlertSender } from '../../framework/firewall/engine/auto-responder.js';
import { firewallCorePlugin } from '../../framework/firewall/bootstrap.js';
import { flushPersist } from './data/store.js';
import fp from 'fastify-plugin';

/**
 * app 侧前置准备（同步调用，必须在注册 firewallCorePlugin **之前**执行）：
 *
 * initDao 把磁盘 firewall_config.json 合并进配置单例 —— registerRateLimit 在插件
 * 注册期读取 defense.enableRateLimit，本函数晚于核心注册会拿默认值误判开关。
 * 历史缺陷（2026-09-15 修复）：initDao 从未被调用，磁盘配置从未被加载，
 * 且下一次保存会用默认值覆盖磁盘文件。
 *
 * 邮件通道注入：引擎在 framework 层，framework 不得 import app（契约测试守卫）；
 * 发信能力属于 notice，由这里把「动态 import + 发送」注册给引擎。
 * 依赖方向始终 app → framework。
 */
function prepareAppFirewall() {
  initDao();

  registerEmailAlertSender(async (to, subject, html) => {
    const emailService = await import('../../framework/notice/services/email.js');
    await emailService.default.send(to, subject, html);
  });
}

/**
 * app 侧收尾插件：手动名单同步（访问层自行判断 Redis 是否可用）
 * 与 onClose 清理（DAO 保存定时器 + 内存遥测落盘）
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
const firewallAppPlugin = fp(async function (app) {
  await syncManualBlacklistToRedis();
  await syncManualWhitelistToRedis();

  app.addHook('onClose', async () => {
    cleanupSaveTimer();
    // 遥测只在内存里，滚动发布 / 重启时不落盘就会丢掉最近的统计
    await flushPersist();
  });
});

/**
 * 完整组合：prepare → 防护核心 → finalize。
 * 仅供测试使用（生产由 05-firewall.js 分步编排），见文件头注释。
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
const initFirewall = fp(async function (app) {
  prepareAppFirewall();
  await app.register(firewallCorePlugin);
  await app.register(firewallAppPlugin);
});

/**
 * **10-apps 入口**（生产路径）：app 侧初始化 + 收尾插件。
 *
 * 为什么不在这里注册防护核心：核心必须早于 08-api（@fastify/rate-limit 的 onRoute
 * 只对之后注册的路由生效），所以核心由 05-firewall.js 单独注册。本文件只负责
 * app 层能力：① initDao（面板配置的来源）+ 邮件通道；② 名单同步 + onClose 落盘。
 *
 * 历史：这段曾经由 05-firewall.js 用「存在性守卫 + 动态 import」反向调用（framework → app），
 * 根源是配置读取住在了 app 层。配置读取已下沉 framework/firewall/config/persisted.js，
 * 依赖方向恢复单向：app → framework。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 */
async function firewallAppInit(app) {
  prepareAppFirewall();
  await app.register(firewallAppPlugin);
}

export { prepareAppFirewall, firewallAppPlugin, initFirewall, firewallAppInit };
