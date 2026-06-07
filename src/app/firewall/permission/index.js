import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * 防火墙应用域 (Firewall Domain) 权限字典常量
 * 使用工厂函数自动合并元数据注册与常量导出，遵循 DRY 原则。
 */
export const FIREWALL_PERMISSIONS = createPermissionRegistry('firewall', '防火墙模块', {
  // 监控查看（所有登录用户）
  MONITOR: {
    READ: { code: 'fw:monitor:read', label: '查看监控数据', type: 'read' },
    LOGS: { code: 'fw:monitor:logs', label: '查看访问日志', type: 'read' },
    SUMMARY: { code: 'fw:monitor:summary', label: '查看统计摘要', type: 'read' }
  },

  // 封禁管理（操作员）
  BLOCK: {
    READ: { code: 'fw:block:read', label: '查看封禁列表', type: 'read' },
    WRITE: { code: 'fw:block:write', label: '添加/移除封禁', type: 'write' },
    FINGERPRINT: { code: 'fw:block:fp', label: '指纹封禁管理', type: 'write' }
  },

  // 白名单管理（操作员）
  WHITELIST: {
    READ: { code: 'fw:whitelist:read', label: '查看白名单', type: 'read' },
    WRITE: { code: 'fw:whitelist:write', label: '添加/移除白名单', type: 'write' }
  },

  // 安全配置（管理员）
  CONFIG: {
    READ: { code: 'fw:config:read', label: '查看安全配置', type: 'read' },
    WRITE: { code: 'fw:config:write', label: '修改安全配置', type: 'write' },
    TOGGLE: { code: 'fw:config:toggle', label: '切换策略开关', type: 'write' }
  },

  // 防御策略（管理员）
  DEFENSE: {
    READ: { code: 'fw:defense:read', label: '查看防御策略', type: 'read' },
    WRITE: { code: 'fw:defense:write', label: '修改防御策略', type: 'write' }
  },

  // 管理员超级权限
  ADMIN: {
    ALL: { code: 'fw:admin:*', label: '防火墙管理员全量通配符', type: 'wildcard' },
    NODE: { code: 'fw:admin:node', label: '节点管理', type: 'high_risk' },
    RESET: { code: 'fw:admin:reset', label: '重置统计数据', type: 'high_risk' }
  }
});

export default FIREWALL_PERMISSIONS;
