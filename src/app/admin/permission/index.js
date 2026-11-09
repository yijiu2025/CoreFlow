/**
 * 管理后台权限常量
 * 使用 createPermissionRegistry 工厂函数定义权限
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { createPermissionRegistry } from '../../../framework/security/pbac/index.js';

/**
 * 管理后台权限定义
 * 三段式格式: admin:资源:动作
 */
const ADMIN_PERMISSIONS = createPermissionRegistry('admin', '管理后台', {
  // 用户管理
  USER: {
    READ: { code: 'admin:user:read', label: '查看用户', type: 'read' },
    CREATE: { code: 'admin:user:create', label: '创建用户', type: 'write' },
    UPDATE: { code: 'admin:user:update', label: '编辑用户', type: 'write' },
    DELETE: { code: 'admin:user:delete', label: '删除用户', type: 'high_risk' },
    ALL: { code: 'admin:user:*', label: '用户管理通配', type: 'wildcard' }
  },

  // 角色管理
  ROLE: {
    READ: { code: 'admin:role:read', label: '查看角色', type: 'read' },
    CREATE: { code: 'admin:role:create', label: '创建角色', type: 'write' },
    UPDATE: { code: 'admin:role:update', label: '编辑角色', type: 'write' },
    DELETE: { code: 'admin:role:delete', label: '删除角色', type: 'high_risk' },
    ASSIGN: { code: 'admin:role:assign', label: '分配角色', type: 'high_risk' },
    ALL: { code: 'admin:role:*', label: '角色管理通配', type: 'wildcard' }
  },

  // 策略管理
  POLICY: {
    READ: { code: 'admin:policy:read', label: '查看策略', type: 'read' },
    CREATE: { code: 'admin:policy:create', label: '创建策略', type: 'write' },
    UPDATE: { code: 'admin:policy:update', label: '编辑策略', type: 'write' },
    DELETE: { code: 'admin:policy:delete', label: '删除策略', type: 'high_risk' },
    ALL: { code: 'admin:policy:*', label: '策略管理通配', type: 'wildcard' }
  },

  // 系统管理
  SYSTEM: {
    CONFIG: { code: 'admin:system:config', label: '系统配置', type: 'write' },
    LOG: { code: 'admin:system:log', label: '查看日志', type: 'read' },
    ALL: { code: 'admin:system:*', label: '系统管理通配', type: 'wildcard' }
  },

  // 管理后台工作台
  DASHBOARD: {
    READ: { code: 'admin:dashboard:read', label: '查看工作台', type: 'read' }
  },

  // 菜单管理（决定侧栏可见性，不承载接口放行）
  MENU: {
    READ: { code: 'admin:menu:read', label: '查看菜单', type: 'read' },
    CREATE: { code: 'admin:menu:create', label: '创建菜单', type: 'write' },
    UPDATE: { code: 'admin:menu:update', label: '编辑菜单', type: 'write' },
    DELETE: { code: 'admin:menu:delete', label: '删除菜单', type: 'high_risk' },
    ALL: { code: 'admin:menu:*', label: '菜单管理通配', type: 'wildcard' }
  },

  // 部门管理
  DEPT: {
    READ: { code: 'admin:dept:read', label: '查看部门', type: 'read' },
    CREATE: { code: 'admin:dept:create', label: '创建部门', type: 'write' },
    UPDATE: { code: 'admin:dept:update', label: '编辑部门', type: 'write' },
    DELETE: { code: 'admin:dept:delete', label: '删除部门', type: 'high_risk' },
    ALL: { code: 'admin:dept:*', label: '部门管理通配', type: 'wildcard' }
  },

  // 岗位管理
  POST: {
    READ: { code: 'admin:post:read', label: '查看岗位', type: 'read' },
    CREATE: { code: 'admin:post:create', label: '创建岗位', type: 'write' },
    UPDATE: { code: 'admin:post:update', label: '编辑岗位', type: 'write' },
    DELETE: { code: 'admin:post:delete', label: '删除岗位', type: 'high_risk' },
    ALL: { code: 'admin:post:*', label: '岗位管理通配', type: 'wildcard' }
  },

  // 字典管理
  DICT: {
    READ: { code: 'admin:dict:read', label: '查看字典', type: 'read' },
    CREATE: { code: 'admin:dict:create', label: '创建字典', type: 'write' },
    UPDATE: { code: 'admin:dict:update', label: '编辑字典', type: 'write' },
    DELETE: { code: 'admin:dict:delete', label: '删除字典', type: 'high_risk' },
    ALL: { code: 'admin:dict:*', label: '字典管理通配', type: 'wildcard' }
  },

  // 参数管理
  CONFIG: {
    READ: { code: 'admin:config:read', label: '查看参数', type: 'read' },
    CREATE: { code: 'admin:config:create', label: '创建参数', type: 'write' },
    UPDATE: { code: 'admin:config:update', label: '编辑参数', type: 'write' },
    DELETE: { code: 'admin:config:delete', label: '删除参数', type: 'high_risk' },
    ALL: { code: 'admin:config:*', label: '参数管理通配', type: 'wildcard' }
  },

  // 日志审计（操作日志 / 登录日志共用）
  LOG: {
    READ: { code: 'admin:log:read', label: '查看日志', type: 'read' },
    REMOVE: { code: 'admin:log:remove', label: '清理日志', type: 'high_risk' },
    ALL: { code: 'admin:log:*', label: '日志审计通配', type: 'wildcard' }
  },

  // 防火墙只读监控
  FIREWALL: {
    READ: { code: 'admin:firewall:read', label: '查看防火墙', type: 'read' }
  },

  // 代码生成（二期）
  GEN: {
    READ: { code: 'admin:gen:read', label: '查看生成器', type: 'read' },
    EXECUTE: { code: 'admin:gen:execute', label: '执行代码生成', type: 'high_risk' },
    ALL: { code: 'admin:gen:*', label: '代码生成通配', type: 'wildcard' }
  },

  // 管理员通配符
  ADMIN: {
    ALL: { code: 'admin:*', label: '管理后台全量通配符', type: 'wildcard' }
  }
});

export { ADMIN_PERMISSIONS };
export default ADMIN_PERMISSIONS;
