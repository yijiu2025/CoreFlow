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
  /*
   * 🔴 非字符串的 `code` 一律判「不通过」，**绝不能**继续走到 `code.startsWith`。
   *
   * 真实事故（2026-11-22）：`dashboard.js` 把 `ADMIN_PERMISSIONS.LOG.READ.code` 传进来，
   * 而注册表产出的 `READ` 本身就是字符串 —— `.code` 是 `undefined`。持有 `admin:*`
   * 的账号走进通配分支后 `undefined.startsWith(...)` 直接抛 TypeError，工作台整体 500，
   * 响应里只有一句 "Cannot read properties of undefined (reading 'startsWith')"，
   * 完全看不出是哪条权限码。判定函数是全局热点，必须自己吞掉坏入参。
   *
   * 与前端的 `src/utils/permission.ts` 同一判据：没有码 = 不通过（不是"默认放行"）。
   */
  if (typeof code !== 'string' || code === '') return false;
  const list = toPermissionList(permissions);
  return list.some(pattern => {
    if (pattern === '*' || pattern === code) return true;
    if (pattern.endsWith('*')) return code.startsWith(pattern.slice(0, -1));
    return false;
  });
}

/**
 * 是否拥有某个**命名空间**下的任一权限
 *
 * 与 `hasPermissionLike` 的区别：那个问"能不能干这一件事"（授予的通配要能覆盖所需
 * 的具体码），本函数问"是不是这一族里的"（任一条 `admin:xxx` 都算）。
 * 登录准入用它 —— 只关心有没有管理能力，不关心具体是哪一条。
 *
 * @param {unknown} permissions PBAC 权限集对象 / 数组
 * @param {string} namespace 命名空间（如 `admin`）
 * @returns {boolean} 是否命中
 */
function hasAnyPermissionIn(permissions, namespace) {
  const list = toPermissionList(permissions);
  const prefix = `${namespace}:`;
  return list.some(code => code === '*' || code === prefix + '*' || code.startsWith(prefix));
}

export { toPermissionList, hasPermissionLike, hasAnyPermissionIn };
