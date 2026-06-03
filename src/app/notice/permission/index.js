import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

/**
 * 通知应用权限字典常量
 */
export const NOTICE_PERMISSIONS = createPermissionRegistry(
  'notice',
  '通知模块',
  {
    CONFIG: {
      READ: { code: 'notice:config:read', label: '查看通知配置', type: 'read' },
      WRITE: {
        code: 'notice:config:write',
        label: '修改通知配置',
        type: 'write'
      }
    },
    TEMPLATE: {
      READ: { code: 'notice:template:read', label: '查看模板', type: 'read' },
      WRITE: { code: 'notice:template:write', label: '管理模板', type: 'write' }
    }
  }
);

export default NOTICE_PERMISSIONS;
