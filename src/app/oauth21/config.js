/**
 * OAuth2.1 应用配置
 * 供 loader 扫描时读取
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { createCsrfProtectionPlugin } from './middleware/csrf.middleware.js';
import { CSRF_EXCLUDE_PATHS } from './config/csrf-exclude.js';
import { sensitiveRateLimitPlugin } from './middleware/rate-limiter.js';
import { initOAuthMiddleware } from './middleware/auth.middleware.js';

/**
 * 组装根作用域插件清单
 *
 * `OAUTH21_SECURITY_HOOKS=off` 是**应急开关**：CSRF 会让「前端版本落后于后端」的客户端
 * 在登录/确认授权时拿到 403（老 bundle 不会带 `x-csrf-token`）。真出现这种发布错序时，
 * 先在环境变量里置 off 恢复登录，再排查前端版本 —— 不要把开关当常态。
 * 关闭时**保留 H5 签名**：它只对显式声明 requireSignature 的路由生效，不影响登录放行。
 *
 * @param {object} [env] - 环境变量（便于测试注入）
 * @returns {Function[]} fastify 插件列表
 */
function buildRootPlugins(env = process.env) {
  const signatureOnly = [initOAuthMiddleware];
  if (env.OAUTH21_SECURITY_HOOKS === 'off') return signatureOnly;
  return [sensitiveRateLimitPlugin, createCsrfProtectionPlugin({ exclude: CSRF_EXCLUDE_PATHS }), initOAuthMiddleware];
}

const oauth21Config = {
  app_id: 'oauth21',
  name: 'OAuth 2.1 授权中心',
  description: 'OAuth 2.1 / OIDC 授权服务器，负责客户端管理、授权码流程、令牌签发与撤销',

  /**
   * 需要注册在**根作用域**的插件。
   *
   * 🔴 为什么不能放进 `init`：`init` 被 loader 以 `app.register(init)` 调用，运行在独立封装
   * 作用域里；业务路由早于本应用由 08-api 注册在根作用域，`init` 内 `addHook` 的钩子
   * 覆盖不到它们（等于没接）。U4 的 H5 签名、U21 的 CSRF 与敏感接口限频，都栽在同一件事上。
   *
   * 作用域收窄由各插件自身完成：三者都只处理 `/oauth2.1` 前缀内的请求
   * （`/oauth2.10` 不误命中），不影响 admin / firewall / retroweb 等其他前端。
   *
   * 顺序：限频在最前（省掉后续解析），CSRF 次之（拒绝伪造请求），签名最后（业务级校验）。
   */
  rootPlugins: buildRootPlugins()
};

export { buildRootPlugins };

export default oauth21Config;
