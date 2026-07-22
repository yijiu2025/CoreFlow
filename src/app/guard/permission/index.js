/**
 * 守卫配置应用权限字典
 *
 * @author yijiu2025
 * @since 2026-07-22
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const GUARD_PERMISSIONS = createPermissionRegistry('guard', '守卫配置', {
  CONFIG: {
    READ: { code: 'guard:config:read', label: '查看守卫配置', type: 'read' },
    WRITE: { code: 'guard:config:write', label: '修改守卫配置', type: 'write' },
    SYNC: { code: 'guard:config:sync', label: '同步守卫配置到数据库', type: 'execute' }
  }
});

export default GUARD_PERMISSIONS;
