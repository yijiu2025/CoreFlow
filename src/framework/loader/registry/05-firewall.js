/**
 * Loader：防火墙插件加载（五层拦截管道）
 *
 * ⚠️ 位置（05）是**功能性的**，不能挪到 10-apps，也不能改为 config.js 的 `init`：
 * ```
 * 00-globals → 01-monitor → 02-redis → 03-db → 04-auth → [05-firewall]
 *   → 06-models → 07-keys → [08-api 注册全部路由] → 09-notice → 10-apps
 * ```
 * `initFirewall` 内部要注册 `@fastify/rate-limit`，而该插件（v10）是通过
 * `addHook('onRoute', ...)` 给**每条已注册的路由**挂限流配置的 —— 也就是说它只对
 * 「注册在它之后」的路由生效。
 *
 * 放在 10-apps（即 08-api 之后）时：全局限流插件注册成功、`printPlugins` 也能看到它，
 * 但 `onRoute` 钩子对已经注册完的 401 条路由一次都不会触发 →
 * **限流整条链路静默失效**（实测 max=2 连打 6 次仍全部 200）。
 * 这正是「配置已加载但限流不生效」的根因，与 initDao 未调用是两个独立缺陷。
 *
 * 历史上本文件与 `app/firewall/config.js` 的 `init` 同时注册过 `initFirewall`，
 * 导致统计 ×2；修复方式是**在此处保留唯一注册点**（因为这里是更早、更正确的位置），
 * 而不是删掉本文件 —— 删掉它会把限流一起删失效。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { initFirewall } from '../../../app/firewall/index.js';

const firewallLoader = async app => {
  await app.register(initFirewall);
};

export default firewallLoader;
