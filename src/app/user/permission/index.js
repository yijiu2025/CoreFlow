import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * 用户应用域 (User Domain) 权限字典常量
 * 使用工厂函数自动合并元数据注册与常量导出，遵循 DRY 原则。
 */
export const USER_PERMISSIONS = createPermissionRegistry('user', '用户模块', {
  // 基础操作 (所有登录用户都应有)
  BASE: {
    READ: { code: 'user:base:read', label: '查看基础资料', type: 'read' },
    WRITE: { code: 'user:base:write', label: '修改基础资料', type: 'write' }
  },

  // VIP 专属操作
  VIP: {
    PREMIUM_FEATURE: {
      code: 'user:vip:feature',
      label: 'VIP专属高级功能',
      type: 'execute'
    }
  },

  // 管理员高危操作
  ADMIN: {
    ALL: { code: 'user:admin:*', label: '管理员全量通配符', type: 'wildcard' },
    BAN: { code: 'user:admin:ban', label: '封禁其他用户', type: 'high_risk' },
    ROLE: { code: 'user:admin:role', label: '分配权限角色', type: 'high_risk' }
  }
});

export default USER_PERMISSIONS;
