/**
 * OAuth 2.1 角色定义
 * 使用 defineRoles 注册角色，loader 启动时自动同步到数据库
 */
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { OAUTH_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'oauth_viewer',
    app_id: 'oauth21',
    name: 'OAuth 观察者',
    rank_level: 10,
    description: '只读权限，可查看客户端和 Token',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            OAUTH_PERMISSIONS.CLIENT.READ,
            OAUTH_PERMISSIONS.TOKEN.READ,
            OAUTH_PERMISSIONS.SCOPE.READ
          ]
        }
      ]
    }
  },
  {
    code: 'oauth_operator',
    app_id: 'oauth21',
    name: 'OAuth 操作员',
    rank_level: 50,
    description: '可管理客户端和授权',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            OAUTH_PERMISSIONS.CLIENT.ALL,
            OAUTH_PERMISSIONS.AUTH.ALL,
            OAUTH_PERMISSIONS.TOKEN.READ,
            OAUTH_PERMISSIONS.SCOPE.READ
          ]
        }
      ]
    }
  },
  {
    code: 'oauth_admin',
    app_id: 'oauth21',
    name: 'OAuth 管理员',
    rank_level: 80,
    description: '拥有 OAuth 全部权限',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [OAUTH_PERMISSIONS.ADMIN.ALL]
        }
      ]
    }
  }
]);
