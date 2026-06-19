/**
 * 管理后台权限常量
 * 使用 createPermissionRegistry 工厂函数定义权限
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * 管理后台权限定义
 * 三段式格式: admin:资源:动作
 */
export const ADMIN_PERMISSIONS = createPermissionRegistry('admin', '管理后台', {
  // 用户管理
  USER: {
    READ:   { code: 'admin:user:read',   label: '查看用户',     type: 'read' },
    CREATE: { code: 'admin:user:create', label: '创建用户',     type: 'write' },
    UPDATE: { code: 'admin:user:update', label: '编辑用户',     type: 'write' },
    DELETE: { code: 'admin:user:delete', label: '删除用户',     type: 'high_risk' },
    ALL:    { code: 'admin:user:*',      label: '用户管理通配', type: 'wildcard' }
  },

  // 角色管理
  ROLE: {
    READ:   { code: 'admin:role:read',   label: '查看角色',     type: 'read' },
    CREATE: { code: 'admin:role:create', label: '创建角色',     type: 'write' },
    UPDATE: { code: 'admin:role:update', label: '编辑角色',     type: 'write' },
    DELETE: { code: 'admin:role:delete', label: '删除角色',     type: 'high_risk' },
    ASSIGN: { code: 'admin:role:assign', label: '分配角色',     type: 'high_risk' },
    ALL:    { code: 'admin:role:*',      label: '角色管理通配', type: 'wildcard' }
  },

  // 策略管理
  POLICY: {
    READ:   { code: 'admin:policy:read',   label: '查看策略',     type: 'read' },
    CREATE: { code: 'admin:policy:create', label: '创建策略',     type: 'write' },
    UPDATE: { code: 'admin:policy:update', label: '编辑策略',     type: 'write' },
    DELETE: { code: 'admin:policy:delete', label: '删除策略',     type: 'high_risk' },
    ALL:    { code: 'admin:policy:*',      label: '策略管理通配', type: 'wildcard' }
  },

  // 系统管理
  SYSTEM: {
    CONFIG: { code: 'admin:system:config', label: '系统配置',     type: 'write' },
    LOG:    { code: 'admin:system:log',    label: '查看日志',     type: 'read' },
    ALL:    { code: 'admin:system:*',      label: '系统管理通配', type: 'wildcard' }
  },

  // 管理员通配符
  ADMIN: {
    ALL: { code: 'admin:*', label: '管理后台全量通配符', type: 'wildcard' }
  }
});

export default ADMIN_PERMISSIONS;
