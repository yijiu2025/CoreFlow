/**
 * 全局 PBAC 角色注册中心
 * 
 * 使用方法:
 * import { defineRoles } from '@/utils/PbacRegistry.js';
 * defineRoles([{ code: 'admin', ... }]);
 */

export const roleRegistry = [];
export const actionMetaRegistry = []; // 用于存储暴露给前端渲染复选框用的权限字典元数据

export function defineRoles(roles) {
  if (Array.isArray(roles)) {
    roleRegistry.push(...roles);
  } else {
    roleRegistry.push(roles);
  }
}

export function definePermissionMeta(metaObj) {
  actionMetaRegistry.push(metaObj);
}

/**
 * 权限字典生成工厂 (DRY 优化方案)
 * 通过一次性声明，同时生成给后端使用的常量对象和给前端使用的元数据
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
