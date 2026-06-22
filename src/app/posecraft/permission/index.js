/**
 * PoseCraft 权限常量
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const POSECRAFT_PERMISSIONS = createPermissionRegistry('posecraft', 'PoseCraft', {
  TEMPLATE: {
    READ:   { code: 'posecraft:template:read',   label: '查看模板', type: 'read' },
    CREATE: { code: 'posecraft:template:create', label: '创建模板', type: 'write' },
    UPDATE: { code: 'posecraft:template:update', label: '编辑模板', type: 'write' },
    DELETE: { code: 'posecraft:template:delete', label: '删除模板', type: 'high_risk' },
    ALL:    { code: 'posecraft:template:*',      label: '模板通配', type: 'wildcard' }
  },
  WORK: {
    READ:   { code: 'posecraft:work:read',   label: '查看作品', type: 'read' },
    CREATE: { code: 'posecraft:work:create', label: '创建作品', type: 'write' },
    DELETE: { code: 'posecraft:work:delete', label: '删除作品', type: 'high_risk' },
    ALL:    { code: 'posecraft:work:*',      label: '作品通配', type: 'wildcard' }
  },
  ANALYSIS: {
    USE:  { code: 'posecraft:analysis:use',  label: '使用 AI',   type: 'write' },
    VIEW: { code: 'posecraft:analysis:view', label: '查看记录', type: 'read' },
    ALL:  { code: 'posecraft:analysis:*',    label: '分析通配', type: 'wildcard' }
  },
  ADMIN: {
    ALL: { code: 'posecraft:*', label: '全量通配符', type: 'wildcard' }
  }
});

export default POSECRAFT_PERMISSIONS;
