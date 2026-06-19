/**
 * OAuth 2.1 权限常量
 * 使用 createPermissionRegistry 工厂函数定义权限
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * OAuth 2.1 权限定义
 * 三段式格式: oauth:资源:动作
 */
export const OAUTH_PERMISSIONS = createPermissionRegistry('oauth21', 'OAuth 2.1 授权中心', {
  // 客户端管理
  CLIENT: {
    READ:   { code: 'oauth:client:read',   label: '查看客户端',     type: 'read' },
    CREATE: { code: 'oauth:client:create', label: '创建客户端',     type: 'write' },
    UPDATE: { code: 'oauth:client:update', label: '编辑客户端',     type: 'write' },
    DELETE: { code: 'oauth:client:delete', label: '删除客户端',     type: 'high_risk' },
    ALL:    { code: 'oauth:client:*',      label: '客户端管理通配', type: 'wildcard' }
  },

  // 授权管理
  AUTH: {
    AUTHORIZE: { code: 'oauth:auth:authorize', label: '授权操作',     type: 'write' },
    REVOKE:    { code: 'oauth:auth:revoke',    label: '撤销授权',     type: 'high_risk' },
    ALL:       { code: 'oauth:auth:*',         label: '授权管理通配', type: 'wildcard' }
  },

  // Token 管理
  TOKEN: {
    READ:   { code: 'oauth:token:read',   label: '查看 Token',   type: 'read' },
    CREATE: { code: 'oauth:token:create', label: '签发 Token',   type: 'write' },
    REVOKE: { code: 'oauth:token:revoke', label: '吊销 Token',   type: 'high_risk' },
    ALL:    { code: 'oauth:token:*',      label: 'Token 管理通配', type: 'wildcard' }
  },

  // Scope 管理
  SCOPE: {
    READ:   { code: 'oauth:scope:read',   label: '查看 Scope',   type: 'read' },
    MANAGE: { code: 'oauth:scope:manage', label: '管理 Scope',   type: 'write' },
    ALL:    { code: 'oauth:scope:*',      label: 'Scope 管理通配', type: 'wildcard' }
  },

  // 管理员通配符
  ADMIN: {
    ALL: { code: 'oauth:*', label: 'OAuth 全量通配符', type: 'wildcard' }
  }
});

export default OAUTH_PERMISSIONS;
