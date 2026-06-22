/**
 * OAuth2.1 应用配置
 * 供 loader 扫描时读取
 */
import { registerCsrfProtection } from '../../api/oauth21/v1/shared/csrf.js';
import { CSRF_EXCLUDE_PATHS } from './config/csrf-exclude.js';
import { registerSensitiveRateLimits } from './middleware/rate-limiter.js';

export default {
  app_id: 'oauth21',
  name: 'OAuth 2.1 授权中心',
  description: 'OAuth 2.1 / OIDC 授权服务器，负责客户端管理、授权码流程、令牌签发与撤销',

  /**
   * 应用初始化钩子
   * loader 扫描时自动调用，注册 CSRF 保护和敏感接口限频
   */
  async init(app) {
    // 敏感接口限频（登录/验证码/注册）
    registerSensitiveRateLimits(app, app.redis || null);

    // CSRF 保护（排除公开接口）
    registerCsrfProtection(app, { exclude: CSRF_EXCLUDE_PATHS });
  }
};
