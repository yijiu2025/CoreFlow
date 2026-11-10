/**
 * 应用准入判定（登录闸门）
 *
 * 解决的问题：统一身份认证（oauth21）面向**所有注册用户**，而管理后台只应对
 * **被授予管理权限**的账号开放。没有这层判定时，普通注册用户能走完 SSO →
 * `bind-session` → 拿到会话，进后台看到的是空壳（菜单为空、接口全 403），
 * 表现成"能登录但什么都点不动"，既不像成功也不像失败。
 *
 * === 判定来源（全声明式，本模块不含任何应用名硬编码）===
 * ```js
 * // src/app/<app>/config.js
 * access: {
 *   anyPermission: ['admin:*'],        // 任一权限码命中即可（支持通配）
 *   anyRole: ['superadmin'],           // 或任一角色命中即可（历史账号兜底）
 *   denyMessage: '该账号没有管理后台访问权限，请联系管理员分配角色'
 * }
 * ```
 * 两个数组都为空 / 未声明 `access` ⇒ **不限制**（其它应用维持原行为）。
 *
 * === 权限从哪来 ===
 * `getPermissions()`（带指纹校验的唯一读口），命名空间经 `resolvePermissionAppId`
 * 映射 —— console 的角色住在历史 namespace `admin` 下，直接用登录 appId 查会恒为空。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { getAppConfig, resolvePermissionAppId } from '../../../config/app-registry.js';
import { createLogger } from '../../../support/log/index.js';
import { getPermissions } from './perm-cache.js';

const log = createLogger('framework.auth.app-access');

/** 缺省拒绝文案（应用没写 `denyMessage` 时用它） */
const DEFAULT_DENY_MESSAGE = '该账号没有访问本应用的权限，请联系管理员分配角色';

/**
 * 权限模式匹配（**双向通配**）
 *
 * 与路由守卫的 `matchSingle` 方向不同：那里"授予的通配能否覆盖所需的具体码"，
 * 这里问的是"授予的码能否落进某个**命名空间**"。两个方向都要认：
 *
 * ```
 * 授予 admin:*        vs 所需 admin:user:read   → 命中（前缀通配，守卫同款）
 * 授予 admin:user:read vs 所需 admin:*          → 命中（命名空间，本模块专有）
 * 授予 *              vs 任何                  → 命中
 * ```
 *
 * 为什么要后一个方向：准入只关心"有没有这一族能力"，不关心具体是哪一条；
 * 若只按守卫的方向匹配，持有 `admin:user:read` 的账号会被判成"没有 admin:*"，
 * 于是所有非超管账号都进不来 —— 正是本次要修的那种"看起来合理、实际全禁"。
 *
 * @param {string} granted 授予的权限码（可含 `*`）
 * @param {string} pattern 所需模式（可含 `*`）
 * @returns {boolean} 是否命中
 */
function permissionCovers(granted, pattern) {
  if (!granted || !pattern) return false;
  if (granted === '*' || pattern === '*' || granted === pattern) return true;
  if (granted.endsWith('*') && pattern.startsWith(granted.slice(0, -1))) return true;
  if (pattern.endsWith('*') && granted.startsWith(pattern.slice(0, -1))) return true;
  return false;
}

/**
 * 是否命中任一条模式
 *
 * @param {string[]} codes 授予的权限码
 * @param {string[]} patterns 需要的模式
 * @returns {boolean} 是否命中
 */
function matchesAny(codes, patterns) {
  if (!Array.isArray(codes) || !Array.isArray(patterns) || patterns.length === 0) return false;
  return patterns.some(pattern => codes.some(code => permissionCovers(code, pattern)));
}

/**
 * 判定某用户能否进入某应用
 *
 * 失败语义只有两种：**放行**（`allowed: true`）或**拒绝并给出文案**。
 * 判定过程本身出错时**按拒绝处理**：闸门的职责是"默认关"，出错时放行等于
 * 在数据库抖动期间把后台敞开。
 *
 * @param {string} appId 登录应用标识（会话里的 `appId`）
 * @param {number} userId 用户内部 ID（数字主键）
 * @returns {Promise<{ allowed: boolean, message?: string, reason?: string }>} 判定结果
 */
async function checkAppAccess(appId, userId) {
  const policy = getAppConfig(appId)?.access;
  const anyPermission = Array.isArray(policy?.anyPermission) ? policy.anyPermission : [];
  const anyRole = Array.isArray(policy?.anyRole) ? policy.anyRole : [];
  if (anyPermission.length === 0 && anyRole.length === 0) return { allowed: true };

  if (!userId) return { allowed: false, message: policy?.denyMessage || DEFAULT_DENY_MESSAGE, reason: 'NO_USER' };

  const permAppId = resolvePermissionAppId(appId);
  let loaded;
  try {
    loaded = await getPermissions(Number(userId), permAppId);
  } catch (err) {
    log.error(`🚫 [AppAccess] 权限加载失败，按拒绝处理: appId=${appId}, userId=${userId}`, err);
    return { allowed: false, message: '权限校验暂时不可用，请稍后重试', reason: 'PERM_LOAD_FAILED' };
  }

  const roles = Array.isArray(loaded?.roles) ? loaded.roles : [];
  const allows = Array.isArray(loaded?.permissions?.allows) ? loaded.permissions.allows : [];
  const denies = Array.isArray(loaded?.permissions?.denies) ? loaded.permissions.denies : [];

  // 显式拒绝优先：Deny 命中任何一条所需模式即拒绝（封禁角色走这条路）
  if (matchesAny(denies, anyPermission)) {
    return { allowed: false, message: policy?.denyMessage || DEFAULT_DENY_MESSAGE, reason: 'DENIED_BY_POLICY' };
  }

  const roleHit = anyRole.length > 0 && roles.some(role => anyRole.includes(role));
  const permHit = matchesAny(allows, anyPermission);
  if (roleHit || permHit) return { allowed: true };

  return { allowed: false, message: policy?.denyMessage || DEFAULT_DENY_MESSAGE, reason: 'NO_CAPABILITY' };
}

export { checkAppAccess, permissionCovers, DEFAULT_DENY_MESSAGE };
