/**
 * 全局 PBAC 角色注册中心
 *
 * 使用方法:
 * import { defineRoles } from '@/utils/PbacRegistry.js';
 * defineRoles([{ code: 'admin', ... }]);
 *
 * @author Claude
 * @since 2026-07-13
 */

export const roleRegistry = [];
export const actionMetaRegistry = []; // 用于存储暴露给前端渲染复选框用的权限字典元数据

/**
 * 注册一个或多个角色到全局角色注册中心
 * @param {object|Array<object>} roles - 单个角色定义对象或角色数组
 */
export function defineRoles(roles) {
  if (Array.isArray(roles)) {
    roleRegistry.push(...roles);
  } else {
    roleRegistry.push(roles);
  }
}

/**
 * 注册权限元数据（供前端渲染复选框使用）
 * @param {object} metaObj - 权限元数据对象，包含 domain/name/actions
 */
export function definePermissionMeta(metaObj) {
  actionMetaRegistry.push(metaObj);
}

/**
 * 权限字典生成工厂 (DRY 优化方案)
 * 通过一次性声明，同时生成给后端使用的常量对象和给前端使用的元数据
 * @param {string} domain - 业务域名称，如 'posecraft'
 * @param {string} name - 业务域中文/英文全称
 * @param {object} rawDefinition - 按分组嵌套的权限原始定义
 * @returns {object} 扁平化的权限常量对象
 */
export function createPermissionRegistry(domain, name, rawDefinition) {
  const constants = {};
  const actions = [];

  for (const [groupKey, group] of Object.entries(rawDefinition)) {
    constants[groupKey] = {};
    for (const [actionKey, meta] of Object.entries(group)) {
      constants[groupKey][actionKey] = meta.code;
      actions.push(meta);
    }
  }

  // 自动打入全局内存
  definePermissionMeta({ domain, name, actions });

  return constants;
}
