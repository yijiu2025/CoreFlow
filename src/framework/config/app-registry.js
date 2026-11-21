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
 * API 路径前缀 → 应用标识（启动期由 `08-api` 按 `system.json` 的 `app_id` 填充）
 *
 * 为什么单独一张表：`src/api/<system>/system.json` 描述的是**路由系统**（Auth / Admin /
 * posecraft…），而会话里的 `appId` 是**登录应用**（console / posecraft…）。两者不是一回事
 * （console 应用的路由系统叫 Admin），必须在**应用自己声明**的地方建立对应关系，
 * 框架层才能"不问具体应用"地判出"这个请求属于谁"。
 *
 * 只登记声明了 `app_id` 的系统：共享系统（Auth / verify / notice / user / files）
 * 不声明，于是永远不会被判定为"某个应用的请求" —— 这正是我们要的（它们本来就跨应用）。
 */
const apiPrefixes = new Map();

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
 * 全部已登记应用的标识（`app_id` 与权限命名空间去重合并）
 *
 * 用途：请求期需要判断「这个 app_id 现在还存不存在」—— 典型是角色 / 菜单 / 数据范围
 * 里存的历史应用标识。应用被卸载（`src/app/<app>/` 整个删掉）后，它的配置不再登记，
 * 这些 id 就成了**孤儿**：数据库行还在，但没有任何路由、权限码或页面认识它。
 * 调用方把本函数的结果当白名单，把孤儿行过滤掉即可 —— **不需要删库**，
 * 应用重新装回来时会自动重新出现。
 *
 * ⚠️ 返回的是**并集**：`console` 这类应用的角色挂在历史命名空间 `admin` 下，
 *    只看 `app_id` 会把它自己的角色判成孤儿。
 *
 * @returns {string[]} 应用标识（不含 `GLOBAL` 之类非应用的占位符）
 */
function listAppIds() {
  const out = new Set();
  for (const cfg of registry.values()) {
    if (cfg.app_id) out.add(String(cfg.app_id));
    const permissionAppId = cfg.permission_app_id;
    if (typeof permissionAppId === 'string' && permissionAppId) out.add(permissionAppId);
  }
  return [...out];
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

/**
 * 登记「API 路径前缀 → 应用」（由 api loader 读 system.json 时调用）
 *
 * @param {string} prefix 路由前缀（如 `/api/admin`）；空串表示根，忽略
 * @param {string} appId 登录应用标识（system.json 的 `app_id`）
 * @returns {void}
 */
function registerApiBinding(prefix, appId) {
  const p = String(prefix || '').trim();
  const id = String(appId || '').trim();
  if (!p || !id) return;
  apiPrefixes.set(p.endsWith('/') ? p.slice(0, -1) : p, id);
}

/**
 * 按请求路径解析所属应用（最长前缀匹配）
 *
 * @param {string} pathname 请求路径（不含 query）
 * @returns {string|null} 应用标识；不属于任何已声明应用时为 null
 */
function resolveAppByPath(pathname) {
  const path = String(pathname || '');
  if (!path) return null;
  let best = null;
  let bestLen = -1;
  for (const [prefix, appId] of apiPrefixes) {
    if (prefix.length <= bestLen) continue;
    /* 前缀边界：`/api/admin` 不能命中 `/api/administrator` */
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      best = appId;
      bestLen = prefix.length;
    }
  }
  return best;
}

/**
 * 按请求 Host 解析所属应用
 *
 * 应用配置可选声明 `hosts: ['console.localhost', 'console.example.com']`。
 * 用于"前端页面与 API 不同 host"的部署（API 网关统一域名），此时路径前缀指不准。
 *
 * @param {string} host 请求 Host（可带端口）
 * @returns {string|null} 应用标识；未声明时 null
 */
function resolveAppByHost(host) {
  const raw = String(host || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  const hostname = raw.replace(/:\d+$/, '');
  for (const config of registry.values()) {
    const hosts = Array.isArray(config?.hosts) ? config.hosts : [];
    if (hosts.some(h => String(h).toLowerCase() === hostname)) return config.app_id;
  }
  return null;
}

/**
 * 解析「这个请求属于哪个应用」
 *
 * 顺序：路径前缀 → Host → null。null 表示"不属于任何已声明应用"，
 * **调用方必须按"不校验"处理**（共享系统就该跨应用可用）。
 *
 * 🔴 新增应用不需要改这里：它只要在自己的 `src/app/<app>/config.js` 里写 `app_id`
 *    （可选 `hosts`）、在 `src/api/<system>/system.json` 里写 `app_id` + `prefix`，
 *    启动期就会自动登记。
 *
 * @param {{pathname?: string, host?: string}} req 请求特征
 * @returns {string|null} 应用标识
 */
function resolveRequestApp(req = {}) {
  return resolveAppByPath(req.pathname) || resolveAppByHost(req.host) || null;
}

export {
  registerAppConfig,
  getAppConfig,
  listAppConfigs,
  listAppIds,
  resolvePermissionAppId,
  registerApiBinding,
  resolveAppByPath,
  resolveAppByHost,
  resolveRequestApp
};
