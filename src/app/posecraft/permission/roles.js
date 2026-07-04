/**
 * PoseCraft 角色定义
 * 用于对接 PBAC 系统，将不同的具体权限点（Action）合理地分配到各个不同的角色身份中。
 */
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { POSECRAFT_PERMISSIONS } from './index.js';

defineRoles([
  // 1. 普通注册用户 (posecraft_user)
  {
    code: 'posecraft_user',
    app_id: 'posecraft',
    name: '普通用户',
    rank_level: 10,
    description: '可使用基础 AI 分析、上传并管理个人作品，购买付费模板',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.WORK.READ,
          POSECRAFT_PERMISSIONS.WORK.CREATE,
          POSECRAFT_PERMISSIONS.WORK.UPDATE, // 仅允许修改个人
          POSECRAFT_PERMISSIONS.WORK.DELETE, // 仅允许删除个人
          POSECRAFT_PERMISSIONS.TEMPLATE.PURCHASE,
          POSECRAFT_PERMISSIONS.ANALYSIS.BASIC // 仅基础分析权限
        ]
      }]
    }
  },

  // 2. VIP 付费会员 (posecraft_vip)
  {
    code: 'posecraft_vip',
    app_id: 'posecraft',
    name: 'VIP 会员',
    rank_level: 30,
    description: '无限次基础 AI 分析，可使用高级/多人 AI 分析，免费使用 VIP 专属模板，免广告',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.WORK.READ,
          POSECRAFT_PERMISSIONS.WORK.CREATE,
          POSECRAFT_PERMISSIONS.WORK.UPDATE,
          POSECRAFT_PERMISSIONS.WORK.DELETE,
          POSECRAFT_PERMISSIONS.TEMPLATE.PURCHASE,
          POSECRAFT_PERMISSIONS.VIP.PREMIUM_TEMPLATES, // 免费用 VIP 模板
          POSECRAFT_PERMISSIONS.VIP.AD_FREE, // 免广告
          POSECRAFT_PERMISSIONS.ANALYSIS.BASIC,
          POSECRAFT_PERMISSIONS.ANALYSIS.PREMIUM // 具备高精度/多人分析权限
        ]
      }]
    }
  },

  // 3. 创作者 (posecraft_creator)
  {
    code: 'posecraft_creator',
    app_id: 'posecraft',
    name: '创作者',
    rank_level: 50,
    description: '可以发布自定义模板、对其定价、查看收益大盘并进行收益提现',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.WORK.READ,
          POSECRAFT_PERMISSIONS.WORK.CREATE,
          POSECRAFT_PERMISSIONS.WORK.UPDATE,
          POSECRAFT_PERMISSIONS.WORK.DELETE,
          POSECRAFT_PERMISSIONS.TEMPLATE.CREATE, // 创建模板特权
          POSECRAFT_PERMISSIONS.TEMPLATE.SET_PRICE, // 售价设置权限
          POSECRAFT_PERMISSIONS.TEMPLATE.PURCHASE,
          POSECRAFT_PERMISSIONS.ANALYSIS.BASIC,
          POSECRAFT_PERMISSIONS.ANALYSIS.PREMIUM,
          POSECRAFT_PERMISSIONS.FINANCE.INCOME_VIEW, // 个人财务大盘
          POSECRAFT_PERMISSIONS.FINANCE.WITHDRAW // 提现申请
        ]
      }]
    }
  },

  // 4. 签约高级创作者 (posecraft_vip_creator)
  {
    code: 'posecraft_vip_creator',
    app_id: 'posecraft',
    name: '签约创作者',
    rank_level: 60,
    description: '高级创作者权限，享有更高比例的分成特权，免广告及绿道支持',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.WORK.READ,
          POSECRAFT_PERMISSIONS.WORK.CREATE,
          POSECRAFT_PERMISSIONS.WORK.UPDATE,
          POSECRAFT_PERMISSIONS.WORK.DELETE,
          POSECRAFT_PERMISSIONS.TEMPLATE.CREATE,
          POSECRAFT_PERMISSIONS.TEMPLATE.SET_PRICE,
          POSECRAFT_PERMISSIONS.TEMPLATE.PURCHASE,
          POSECRAFT_PERMISSIONS.VIP.PREMIUM_TEMPLATES,
          POSECRAFT_PERMISSIONS.VIP.AD_FREE, // 额外享有免广告
          POSECRAFT_PERMISSIONS.ANALYSIS.BASIC,
          POSECRAFT_PERMISSIONS.ANALYSIS.PREMIUM,
          POSECRAFT_PERMISSIONS.FINANCE.INCOME_VIEW,
          POSECRAFT_PERMISSIONS.FINANCE.WITHDRAW
        ]
      }]
    }
  },

  // 5. 运营/审核员 (posecraft_operator)
  {
    code: 'posecraft_operator',
    app_id: 'posecraft',
    name: '审核运营人员',
    rank_level: 70,
    description: '负责日常模板的审核工作，以及下架、删除或修改违规项目',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.WORK.READ,
          POSECRAFT_PERMISSIONS.MODERATION.AUDIT, // 审核权限
          POSECRAFT_PERMISSIONS.MODERATION.DELETE_ANY, // 下架/删除他人违规作品
          POSECRAFT_PERMISSIONS.MODERATION.UPDATE_ANY, // 修改他人敏感配置
          POSECRAFT_PERMISSIONS.ANALYSIS.BASIC
        ]
      }]
    }
  },

  // 6. 系统管理员 (posecraft_admin)
  {
    code: 'posecraft_admin',
    app_id: 'posecraft',
    name: '管理员',
    rank_level: 100,
    description: '具有全量具体的管理控制权（包括审批创作者的提现申请）',
    policy: {
      Version: '2026-06-06',
      Statement: [{
        Effect: 'Allow',
        Action: [
          POSECRAFT_PERMISSIONS.WORK.READ,
          POSECRAFT_PERMISSIONS.WORK.CREATE,
          POSECRAFT_PERMISSIONS.WORK.UPDATE,
          POSECRAFT_PERMISSIONS.WORK.DELETE,
          POSECRAFT_PERMISSIONS.TEMPLATE.CREATE,
          POSECRAFT_PERMISSIONS.TEMPLATE.SET_PRICE,
          POSECRAFT_PERMISSIONS.TEMPLATE.PURCHASE,
          POSECRAFT_PERMISSIONS.VIP.PREMIUM_TEMPLATES,
          POSECRAFT_PERMISSIONS.VIP.AD_FREE,
          POSECRAFT_PERMISSIONS.ANALYSIS.BASIC,
          POSECRAFT_PERMISSIONS.ANALYSIS.PREMIUM,
          POSECRAFT_PERMISSIONS.MODERATION.AUDIT,
          POSECRAFT_PERMISSIONS.MODERATION.DELETE_ANY,
          POSECRAFT_PERMISSIONS.MODERATION.UPDATE_ANY,
          POSECRAFT_PERMISSIONS.FINANCE.INCOME_VIEW,
          POSECRAFT_PERMISSIONS.FINANCE.AUDIT_WITHDRAW // 提现审批权（专属）
        ]
      }]
    }
  }
]);
