/**
 * 权限集合归一化工具
 *
 * 🔴 `request.state.user.permissions` **不是数组**，而是 PBAC 权限集对象
 * `{ allows: string[], denies: string[] }`（由 `getPermissions` 产出）。
 * 前端与路由里做 `permissions.includes(...)` 会直接抛
 * `permissions.includes is not a function` —— 这里统一收口，避免各处各写一套判断。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/**
 * 归一化为权限码数组（去重）
 *
 * @param {unknown} permissions PBAC 权限集对象 / 数组 / 空值
 * @returns {string[]} 权限码数组
 */
function toPermissionList(permissions) {
  if (Array.isArray(permissions)) {
    return Array.from(new Set(permissions.filter(p => typeof p === 'string')));
  }
  const allows = Array.isArray(permissions?.allows) ? permissions.allows : [];
  return Array.from(new Set(allows.filter(p => typeof p === 'string')));
}

/**
 * 判断权限集是否命中某个权限码（支持 `*` 与 `admin:*` 通配）
 *
 * @param {unknown} permissions PBAC 权限集对象 / 数组
 * @param {string} code 待判定权限码
 * @returns {boolean} 是否命中
 */
function hasPermissionLike(permissions, code) {
  const list = toPermissionList(permissions);
  return list.some(pattern => {
    if (pattern === '*' || pattern === code) return true;
    if (pattern.endsWith('*')) return code.startsWith(pattern.slice(0, -1));
    return false;
  });
}

export { toPermissionList, hasPermissionLike };
