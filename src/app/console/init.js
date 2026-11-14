/**
 * Console 应用启动钩子
 *
 * 由 `10-apps` 在启动时调用（`config.init`）。这里只做一件事：把「按钮授权」的
 * 解析器注册给守卫。
 *
 * 为什么要注册而不是让守卫直接 import：按钮授权表（`sys_menu` / `sys_role_menu`）
 * 是**本应用**的表，而 `api/guard.js` 被所有应用共用 —— 让框架认识某一张业务表，
 * 等于给每个应用都绑上控制台的数据库结构。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { registerButtonGrantProvider } from '../../framework/security/auth/index.js';
import buttonGrantService from './services/button-grant.service.js';

/**
 * 注册按钮授权解析器
 *
 * 注册后，守卫在每次权限判定前会问一次「该用户被授权了哪些按钮」，
 * 从而让「取消勾选 = 不显示且不能操作」真正成立（只对 `type=btn` 的码生效）。
 *
 * @returns {Promise<void>}
 */
async function consoleAppInit() {
  registerButtonGrantProvider(buttonGrantService.resolveButtonGate);
}

export { consoleAppInit };
export default consoleAppInit;
