/**
 * 应用配置运行时注册表
 *
 * `10-apps` 启动期扫描 `src/app/<app>/config.js` 后，把每份配置登记到这里，
 * 供**请求期**代码按 `app_id` 反查。目前两个消费方：
 *
 *   1. `security/auth/permission/app-access.js` —— 登录准入判定（`config.access`）
 *   2. `security/auth/session/session-perm.js`  —— 权限命名空间映射（`config.permission_app_id`）
 *
 * 为什么需要这层间接：应用配置是**声明**（`src/app/<app>/config.js`），而请求期代码
 * 在 framework 层，不该反向 import 具体应用目录（会形成 framework → app 的依赖）。
 * 注册表把"谁声明了什么"在启动期收成一张表，请求期只查表。
 *
 * ⚠️ 缺配置时一律返回 `null`，消费方必须写保底行为（不限制 / 用自报 appId）——
 * 单测里只加载 framework 而不跑 loader 是非常常见的场景，不应因此炸掉。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */

/** app_id → 应用配置（启动期由 10-apps 填充） */
const registry = new Map();

/**
 * 登记一份应用配置
 *
 * 同一 app_id 重复登记时**后写覆盖**（HMR / 重复加载时保持幂等，不做报错）。
 *
 * @param {object} config 应用配置（`src/app/<app>/config.js` 的默认导出）
 * @returns {void}
 */
function registerAppConfig(config) {
  const appId = config?.app_id;
  if (!appId || typeof appId !== 'string') return;
  registry.set(appId, config);
}

/**
 * 按 app_id 取应用配置
 *
 * @param {string} appId 应用标识
 * @returns {object|null} 配置，未登记时为 null
 */
function getAppConfig(appId) {
  if (!appId) return null;
  return registry.get(String(appId)) ?? null;
}

/**
 * 全部已登记应用配置（调试面板 / 全局钩子遍历用）
 *
 * @returns {object[]} 配置数组
 */
function listAppConfigs() {
  return [...registry.values()];
}

/**
 * 解析「权限命名空间」
 *
 * 应用标识（OAuth client 的 `appName`，写进会话的 `appId`）与**权限命名空间**
 * （`iam_role.app_id`，决定 `loadUserPermissions` 能取到哪些角色）并不总是同名：
 * console 的登录应用是 `console`，但它的角色（admin_viewer / admin_operator …）
 * 与权限码（`admin:*`）都住在历史 namespace `admin` 下。
 *
 * 🔴 不做这层映射的后果是**静默失效**：`admin_viewer` 用户在 console 会话里的
 * 权限集恒为空，所有 console 接口 403，而角色管理页看起来一切正常（授了、也存了）。
 *
 * @param {string} appId 应用标识
 * @returns {string} 权限命名空间（未声明 `permission_app_id` 时等于 appId）
 */
function resolvePermissionAppId(appId) {
  if (!appId) return appId;
  const declared = getAppConfig(appId)?.permission_app_id;
  return typeof declared === 'string' && declared ? declared : String(appId);
}

export { registerAppConfig, getAppConfig, listAppConfigs, resolvePermissionAppId };
