import { defineRoles } from '../../../utils/PbacRegistry.js';
import { NOTICE_PERMISSIONS } from './index.js';

/**
 * 通知应用角色定义
 */
defineRoles([
  {
    code: 'notice_admin',
    app_id: 'notice',
    name: '通知管理员',
    rank_level: 60,
    description: '拥有通知配置和模板管理权限',
    policy: {
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            NOTICE_PERMISSIONS.CONFIG.READ,
            NOTICE_PERMISSIONS.CONFIG.WRITE,
            NOTICE_PERMISSIONS.TEMPLATE.READ,
            NOTICE_PERMISSIONS.TEMPLATE.WRITE
          ]
        }
      ]
    }
  }
]);
