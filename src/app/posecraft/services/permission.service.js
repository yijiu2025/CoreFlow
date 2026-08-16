/**
 * PoseCraft 数据级权限服务
 *
 * 从 api/posecraft/v1/template.js / work.js 的 checkDataPermission 下沉：
 * 资源创建者本人或管理员（posecraft_admin/operator、全局 admin、持有 audit/delete_any 权限）可越权管理。
 *
 * @author yijiu
 * @since 2026-08-16
 */

/**
 * 细粒度数据级权限校验
 *
 * 1. 资源创建者本人：允许对其自己创建的资源进行修改/删除。
 * 2. 管理员（posecraft_admin/operator、全局 admin，或持有 posecraft:work:audit / work:delete_any 权限）：
 *    允许越权管理任何用户的资源。
 *
 * 传入 item 的 user_id = -1 时仅判定 user 是否为管理员（用于"是否管理员"探针）。
 * @param {object} item - 资源对象，需含 user_id 字段（传 {user_id:-1} 可仅检测管理员身份）
 * @param {object} user - 当前登录用户（session 用户对象）
 * @returns {boolean} 是否拥有数据级操作权限
 */
export function checkDataPermission(item, user) {
  if (!item || !user) return false;

  // 创建者本人
  if (item.user_id === user.userId) return true;

  // 管理员/运营角色或持有审核/删单权限
  const userRoles = user.roles || [];
  const userPermissions = user.permissions?.allows || [];
  return (
    userRoles.includes('posecraft_admin') ||
    userRoles.includes('posecraft_operator') ||
    userRoles.includes('admin') ||
    userPermissions.includes('posecraft:work:audit') ||
    userPermissions.includes('posecraft:work:delete_any')
  );
}
