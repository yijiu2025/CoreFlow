/**
 * 管理后台角色定义
 * 使用 defineRoles 注册角色，loader 启动时自动同步到数据库
 */
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { ADMIN_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'admin_viewer',
    app_id: 'admin',
    name: '管理观察者',
    rank_level: 10,
    description: '只读权限，可查看用户、角色、策略',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            ADMIN_PERMISSIONS.USER.READ,
            ADMIN_PERMISSIONS.ROLE.READ,
            ADMIN_PERMISSIONS.POLICY.READ
          ]
        }
      ]
    }
  },
  {
    code: 'admin_operator',
    app_id: 'admin',
    name: '管理操作员',
    rank_level: 50,
    description: '可管理用户和角色，不可管理系统配置',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            ADMIN_PERMISSIONS.USER.ALL,
            ADMIN_PERMISSIONS.ROLE.ALL,
            ADMIN_PERMISSIONS.POLICY.READ
          ]
        }
      ]
    }
  },
  {
    code: 'admin_admin',
    app_id: 'admin',
    name: '管理后台管理员',
    rank_level: 80,
    description: '拥有管理后台全部权限',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [ADMIN_PERMISSIONS.ADMIN.ALL]
        }
      ]
    }
  }
]);
