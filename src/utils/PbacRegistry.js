/**
 * 全局 PBAC 角色注册中心
 * 
 * 使用方法:
 * import { defineRoles } from '@/utils/PbacRegistry.js';
 * defineRoles([{ code: 'admin', ... }]);
 */

export const roleRegistry = [];

export function defineRoles(roles) {
  if (Array.isArray(roles)) {
    roleRegistry.push(...roles);
  } else {
    roleRegistry.push(roles);
  }
}
