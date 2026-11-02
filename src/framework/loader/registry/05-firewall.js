/**
 * Loader：防火墙加载（framework 防护核心的唯一直启动点）
 *
 * ⚠️ 位置（05）是**功能性的**，不能挪到 10-apps，也不能改为 app config 的 `init`：
 * ```
 * 00-globals → 01-monitor → 02-redis → 03-db → 04-auth → [05-firewall]
 *   → 06-models → 07-keys → [08-api 注册全部路由] → 09-notice → 10-apps
 * ```
 * 防护核心要注册 `@fastify/rate-limit`，而该插件用 `addHook('onRoute', ...)` 给
 * **注册在它之后**的路由挂限流配置。放到 10-apps（08-api 之后）时：插件注册成功、
 * `printPlugins` 也看得到，但 `onRoute` 一次都不会触发 → 限流整条链路静默失效
 * （实测 max=2 连打 6 次仍全部 200）。
 *
 * ── 职责边界（2026-11-02 收口，本文件只做 framework 自己的事）──
 *   ① 读持久化配置：`framework/firewall/config/persisted.js`
 *      —— 核心注册期要读 defense.enableRateLimit，而 app 层配置加载在 10-apps，晚于本步；
 *   ② 注册防护核心：`framework/firewall/bootstrap.js`
 *      —— 限流插件 + 五阶段拦截管道 + 观测钩子，**无条件启动**。
 *
 * app/firewall（面板 / 落盘 / 遥测 / 邮件告警）由 **10-apps** 按应用约定注册
 * （见 `app/firewall/config.js` 的 `init`）。framework 不再 import app：
 * 依赖方向保持单向（app → framework），删除 `src/app/firewall/` 后本文件照常工作，
 * 防护以 framework 默认策略运行，只失去面板 / 持久化写入 / 遥测 / 邮件。
 *
 * 历史注记：
 *   - 曾与 `app/firewall/config.js` 的 `init` 同时注册装配入口 → 管道执行两次、统计 ×2；
 *   - 2026-11-02 前为了「先加载 app 层配置再注册核心」，本文件用动态 import 反向依赖 app
 *     （白名单边 05-firewall → app/firewall/index.js）。根源是**配置读取住错了层**，
 *     现改由 `config/persisted.js` 承担，本文件不再认识 app。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-01 应用可卸载
 * @since 2026-11-02 直接启动 framework 防护核心
 * @since 2026-11-02 配置读取下沉 framework，移除对 app 的反向依赖
 */
import { createLogger } from '../../log/index.js';
import { loadPersistedSettings } from '../../firewall/config/persisted.js';
import { firewallCorePlugin } from '../../firewall/bootstrap.js';

const log = createLogger('framework.loader.registry.05-firewall');

const firewallLoader = async app => {
  // ① 持久化配置（必须在核心注册之前：registerRateLimit 注册期读开关）
  if (!loadPersistedSettings()) {
    log.warn('⚠️ [Firewall] 未读到持久化配置，防护核心以 framework 默认策略启动');
  }

  // ② 防护核心：限流插件 + 五阶段管道 + 观测钩子
  await app.register(firewallCorePlugin);
};

export default firewallLoader;
