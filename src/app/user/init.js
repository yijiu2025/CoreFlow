/**
 * 用户中心（user）应用启动钩子
 *
 * 由 `10-apps` 在启动时调用（`config.init`）。这里只做一件事：把「个人访问令牌」
 * 的解析器注册给框架认证层。
 *
 * 为什么是注册而不是让 `bearer-auth` 直接 import：令牌表（`user_api_tokens`）是
 * **本应用**的表，而认证层被所有应用共用 —— 让框架认识一张业务表，等于给每个
 * 部署形态都绑上用户中心的表结构。未注册时认证层只认 JWT，行为与以前一致。
 *
 * 与 `app/admin/init.js` 注册按钮授权闸是同一套模式。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { registerApiTokenAuthenticator, hasApiTokenAuthenticator } from '../../framework/security/auth/index.js';
import { createLogger } from '../../framework/support/log/index.js';
import { authenticateByApiToken } from './services/api-token-auth.js';

const log = createLogger('app.user.init');

/**
 * 注册个人令牌解析器
 *
 * @returns {Promise<void>}
 */
async function userAppInit() {
  if (hasApiTokenAuthenticator()) return;
  registerApiTokenAuthenticator(authenticateByApiToken);
  log.info('🔑 [User] 个人访问令牌通道已启用（Authorization: Bearer <令牌>）');
}

export { userAppInit };
export default userAppInit;
