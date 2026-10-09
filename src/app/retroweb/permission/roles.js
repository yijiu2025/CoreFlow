/**
 * RetroWeb 角色定义
 *
 * 两个角色的差别**只在配额**（普通 2 个任务 / 会员 50 个）—— 功能权限完全一致。
 * 这样加会员不需要改任何代码路径，只加一个权限点即可。
 *
 * @since 2026-10-09
 */
import { defineRoles } from '../../../utils/PbacRegistry.js';
import { RETROWEB_PERMISSIONS } from './index.js';

/** 两种角色共有的功能权限 */
const BASE_ACTIONS = [
  RETROWEB_PERMISSIONS.TASK.READ,
  RETROWEB_PERMISSIONS.TASK.CREATE,
  RETROWEB_PERMISSIONS.TASK.UPDATE,
  RETROWEB_PERMISSIONS.TASK.DELETE,
  RETROWEB_PERMISSIONS.TASK.IMPORT,
  RETROWEB_PERMISSIONS.TASK.EXPORT,
  RETROWEB_PERMISSIONS.SCHEME.READ,
  RETROWEB_PERMISSIONS.SCHEME.CREATE,
  RETROWEB_PERMISSIONS.SCHEME.UPDATE,
  RETROWEB_PERMISSIONS.SCHEME.DELETE,
  RETROWEB_PERMISSIONS.JOB.SUBMIT,
  RETROWEB_PERMISSIONS.JOB.READ,
  RETROWEB_PERMISSIONS.JOB.CANCEL,
  RETROWEB_PERMISSIONS.LLM.CONFIG,
  RETROWEB_PERMISSIONS.LLM.USE
];

defineRoles([
  // 1. 普通用户：任务上限 2 个
  {
    code: 'retroweb_user',
    app_id: 'retroweb',
    name: '普通用户',
    rank_level: 10,
    description: '可使用全部逆合成功能，任务上限 2 个',
    policy: {
      Version: '2026-06-06',
      Statement: [{ Effect: 'Allow', Action: [...BASE_ACTIONS] }]
    }
  },

  // 2. 会员用户：任务上限 50 个（🔴 与普通用户的唯一差别就是这个权限点）
  {
    code: 'retroweb_member',
    app_id: 'retroweb',
    name: '会员用户',
    rank_level: 20,
    description: '功能同普通用户，任务上限提升到 50 个',
    policy: {
      Version: '2026-06-06',
      Statement: [{ Effect: 'Allow', Action: [...BASE_ACTIONS, RETROWEB_PERMISSIONS.QUOTA.MEMBER] }]
    }
  }
]);
