/**
 * PoseCraft 权限常量定义
 * 提供细粒度 PBAC 权限注册，支持商业化 VIP 模式、创作者收益以及精细化管理员管控。
 */
import { createPermissionRegistry } from '../../../utils/PbacRegistry.js';

export const POSECRAFT_PERMISSIONS = createPermissionRegistry('posecraft', 'PoseCraft', {
  // A. 基础作品与模板权限
  WORK: {
    READ:   { code: 'posecraft:work:read',   label: '查看作品与模板', type: 'read' },
    CREATE: { code: 'posecraft:work:create', label: '创建与上传作品', type: 'write' },
    UPDATE: { code: 'posecraft:work:update', label: '编辑个人作品/模板', type: 'write' },
    DELETE: { code: 'posecraft:work:delete', label: '删除个人作品/模板', type: 'high_risk' }
  },

  // B. 创作者特有：模板管理与定价
  TEMPLATE: {
    CREATE:    { code: 'posecraft:template:create',    label: '创建并发布模板', type: 'write' },
    PURCHASE:  { code: 'posecraft:template:purchase',  label: '购买付费模板', type: 'write' },
    SET_PRICE: { code: 'posecraft:template:set_price', label: '为个人模板设定售价', type: 'write' }
  },

  // C. VIP 会员增值权益
  VIP: {
    PREMIUM_TEMPLATES: { code: 'posecraft:vip:premium_templates', label: '免费使用 VIP 专属模板', type: 'read' },
    AD_FREE:           { code: 'posecraft:vip:ad_free',           label: '免广告特权', type: 'read' }
  },

  // D. AI 姿态分析特权
  ANALYSIS: {
    BASIC:   { code: 'posecraft:analysis:basic',   label: '基础单人 AI 识别', type: 'write' },
    PREMIUM: { code: 'posecraft:analysis:premium', label: '高级/多人 AI 识别', type: 'write' }
  },

  // E. 创作者收益与财务管理
  FINANCE: {
    INCOME_VIEW:    { code: 'posecraft:finance:income_view',    label: '查看收益数据大盘', type: 'read' },
    WITHDRAW:       { code: 'posecraft:finance:withdraw',       label: '发起收益提现申请', type: 'write' },
    AUDIT_WITHDRAW: { code: 'posecraft:finance:audit_withdraw', label: '审批提现申请', type: 'high_risk' }
  },

  // F. 管理与审核专区
  MODERATION: {
    AUDIT:      { code: 'posecraft:work:audit',      label: '审核作品与模板', type: 'high_risk' },
    DELETE_ANY: { code: 'posecraft:work:delete_any', label: '强制下架删除他人项目', type: 'high_risk' },
    UPDATE_ANY: { code: 'posecraft:work:update_any', label: '强制编辑他人项目信息', type: 'high_risk' }
  },

  // G. Banner 管理
  BANNER: {
    MANAGE: { code: 'posecraft:banner:manage', label: '管理首页 Banner', type: 'high_risk' }
  }
});

export default POSECRAFT_PERMISSIONS;
