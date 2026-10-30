/**
 * OAuth2.1 应用配置
 * 供 loader 扫描时读取
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerCsrfProtection } from './middleware/csrf.middleware.js';
import { CSRF_EXCLUDE_PATHS } from './config/csrf-exclude.js';
import { registerSensitiveRateLimits } from './middleware/rate-limiter.js';
import { initOAuthMiddleware } from './middleware/auth.middleware.js';

const oauth21Config = {
  app_id: 'oauth21',
  name: 'OAuth 2.1 授权中心',
  description: 'OAuth 2.1 / OIDC 授权服务器，负责客户端管理、授权码流程、令牌签发与撤销',

  /**
   * 应用初始化钩子
   * loader 扫描时自动调用，注册 CSRF 保护、敏感接口限频与 H5 签名校验
   */
  async init(app) {
    // 敏感接口限频（登录/验证码/注册）——Redis 客户端由限频器惰性解析，
    // 不在此处捕获快照（init 时插件可能尚未完成连接重试，快照会永久为 null）
    registerSensitiveRateLimits(app);

    // CSRF 保护（排除公开接口）
    registerCsrfProtection(app, { exclude: CSRF_EXCLUDE_PATHS });
  },

  /**
   * 需要注册在**根作用域**的插件。
   *
   * 为什么不能放进 init：init 被 loader 以 `app.register(init)` 调用，运行在独立封装
   * 作用域里；业务路由早于本应用由 08-api 注册在根作用域，init 内 addHook 的钩子
   * 覆盖不到它们（等于没接）。根作用域的 hook 才能作用到已注册的路由。
   *
   * 作用域收窄由插件自身完成：H5 签名中间件只处理 /oauth2.1 前缀内的请求，
   * 且仅在路由 config.requireSignature=true 时生效，不影响其他前端。
   */
  rootPlugins: [initOAuthMiddleware]
};

export default oauth21Config;
