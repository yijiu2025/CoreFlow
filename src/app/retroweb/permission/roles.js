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
  },

  // 3. RetroWeb 管理员
  //
  // 🔴 这个角色的 code **必须**是 `${appId}_admin`（即 `retroweb_admin`）——
  //    `framework/auth/permission-loader.js` 对 GLOBAL `superadmin` 是这么做的：
  //    自动 `roles.push('${appId}_admin')` 并按**确切 code** 去 Role 表查它的 policy。
  //    code 写错（比如叫 `retroweb_super`）⇒ 超管在本应用上**一个额外权限都拿不到**，
  //    而且不报错、静默失效。
  //
  // ⚠️ 本角色同时补上了一个既有缺口：`retroweb:admin:task_any` 此前**定义了却无人被授予**
  //    （没有应用级 admin 角色，超管也拿不到）。
  {
    code: 'retroweb_admin',
    app_id: 'retroweb',
    name: 'RetroWeb 管理员',
    rank_level: 80,
    description: '本应用管理：管理他人任务、配置启用哪些模型',
    policy: {
      Version: '2026-06-06',
      Statement: [
        {
          Effect: 'Allow',
          Action: [RETROWEB_PERMISSIONS.ADMIN.TASK_ANY, RETROWEB_PERMISSIONS.ADMIN.MODEL]
        }
      ]
    }
  }
]);
