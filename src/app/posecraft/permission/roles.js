/**
 * PoseCraft 角色定义
 */
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { POSECRAFT_PERMISSIONS } from './index.js';

defineRoles([
  {
    code: 'posecraft_user',
    app_id: 'posecraft',
    name: '普通用户',
    rank_level: 10,
    description: '可使用 AI 分析、创建和查看作品',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.TEMPLATE.READ,
          POSECRAFT_PERMISSIONS.WORK.ALL,
          POSECRAFT_PERMISSIONS.ANALYSIS.ALL
        ]
      }]
    }
  },
  {
    code: 'posecraft_creator',
    app_id: 'posecraft',
    name: '创作者',
    rank_level: 50,
    description: '可创建和管理模板',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.TEMPLATE.ALL,
          POSECRAFT_PERMISSIONS.WORK.ALL,
          POSECRAFT_PERMISSIONS.ANALYSIS.ALL
        ]
      }]
    }
  },
  {
    code: 'posecraft_admin',
    app_id: 'posecraft',
    name: '管理员',
    rank_level: 80,
    description: '拥有全部权限',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [POSECRAFT_PERMISSIONS.ADMIN.ALL]
      }]
    }
  }
]);
