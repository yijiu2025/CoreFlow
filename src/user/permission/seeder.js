import sequelize from '../../db/index.js';
import Logger from '../../log/index.js';
import { USER_PERMISSIONS } from './index.js';

/**
 * 自动加载用户模块的基础角色配置 (Upsert)
 */
export async function seedUserRoles() {
  const { Role } = sequelize.models;
  
  // 如果数据库还没准备好（例如还没执行 initSuperAdmin），跳过
  if (!Role) return;

  const baseRoles = [
    {
      code: 'user_normal',
      app_id: 'GLOBAL',
      name: '普通用户',
      rank_level: 10,
      description: '系统默认的已登录基础用户角色',
      policy: {
        Version: '2026-05-18',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              USER_PERMISSIONS.BASE.READ,
              USER_PERMISSIONS.BASE.WRITE
            ]
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
            Action: [
              USER_PERMISSIONS.BASE.READ,
              USER_PERMISSIONS.BASE.WRITE,
              USER_PERMISSIONS.VIP.PREMIUM_FEATURE
            ]
          }
        ]
      }
    },
    {
      code: 'user_banned',
      app_id: 'GLOBAL',
      name: '小黑屋用户',
      rank_level: 1, // 最低优先级，受所有上级压制
      description: '被系统封禁或限制发言的用户 (纯 Deny)',
      policy: {
        Version: '2026-05-18',
        Statement: [
          {
            // PBAC 精髓：显式拒绝最高优。挂上此角色后，无论有多少个 Allow 都无效
            Effect: 'Deny',
            Action: [
              USER_PERMISSIONS.BASE.WRITE,
              USER_PERMISSIONS.VIP.PREMIUM_FEATURE
            ]
          }
        ]
      }
    }
  ];

  try {
    for (const roleDef of baseRoles) {
      const [role, created] = await Role.findOrCreate({
        where: { code: roleDef.code, app_id: roleDef.app_id },
        defaults: roleDef
      });

      // 如果已存在，且你想每次重启都强制覆盖配置里的策略，取消下方注释：
      // if (!created) {
      //   role.policy = roleDef.policy;
      //   role.name = roleDef.name;
      //   await role.save();
      // }
    }
    Logger.info('✨ [PBAC] 基础角色 (Seeder) 同步完毕');
  } catch (error) {
    Logger.error('❌ [PBAC] 角色数据同步失败:', error);
  }
}
