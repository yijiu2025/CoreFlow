/**
 * 用户模块的基础角色配置 (PBAC)
 *
 * 定义用户应用域的三种角色：普通用户、VIP会员、小黑屋用户。
 * 直接调用 defineRoles，当此文件被任意业务代码 (如 api 路由) import 时，即会触发静态注册。
 *
 * 角色等级（rank_level）：
 * - user_banned: 1（最低，受限用户）
 * - user_normal: 10（普通用户）
 * - user_vip: 50（高级用户）
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
import { defineRoles } from '../../../framework/security/pbac/index.js';
import { USER_PERMISSIONS } from './index.js';

/**
 * 用户模块的基础角色配置 (PBAC)
 * 直接调用 defineRoles，当此文件被任意业务代码 (如 api 路由) import 时，即会触发静态注册。
 */
defineRoles([
  {
    code: 'user_normal',
    app_id: 'GLOBAL',
    name: '普通用户',
    rank_level: 10,
    /**
     * 授权即送的默认角色
     *
     * 🔴 GLOBAL 域里 `user_banned` 的 rank 是 1（比它还低），旧逻辑"取最低职级"
     *    会把小黑屋角色当成默认角色发出去。标上这个标记，解析链就有确定答案，
     *    不再依赖"谁恰好 rank 最低"。
     */
    is_default: true,
    /*
     * 行级数据范围：**仅本人**。
     *
     * 这个角色是"登录即送"的底噪角色，每个新账号都会带一个。留空（列默认 1 = 全部）
     * 会让任何新人一注册就拥有全量数据范围 —— `resolveDataScope` 是取并集、
     * "全部"一票通过，于是管理员精心配的「本部门」会被它直接抬成「全部」。
     * 只有在"没有任何其它角色"时它才生效，此时"仅本人"才是该有的默认值。
     */
    data_scope: 5,
    description: '系统默认的已登录基础用户角色',
    policy: {
      Version: '2026-05-18',
      Statement: [
        {
          Effect: 'Allow',
          Action: [USER_PERMISSIONS.BASE.READ, USER_PERMISSIONS.BASE.WRITE]
        }
      ]
    }
  },
  {
    code: 'user_vip',
    app_id: 'GLOBAL',
    name: 'VIP 会员',
    rank_level: 50,
    description: '拥有专属特权的订阅用户',
    policy: {
      Version: '2026-05-18',
      Statement: [
        {
          Effect: 'Allow',
          Action: [USER_PERMISSIONS.BASE.READ, USER_PERMISSIONS.BASE.WRITE, USER_PERMISSIONS.VIP.PREMIUM_FEATURE]
        }
      ]
    }
  },
  {
    code: 'user_banned',
    app_id: 'GLOBAL',
    name: '小黑屋用户',
    rank_level: 1,
    description: '被系统封禁或限制发言的用户 (纯 Deny)',
    policy: {
      Version: '2026-05-18',
      Statement: [
        {
          Effect: 'Deny',
          Action: [USER_PERMISSIONS.BASE.WRITE, USER_PERMISSIONS.VIP.PREMIUM_FEATURE]
        }
      ]
    }
  }
]);
