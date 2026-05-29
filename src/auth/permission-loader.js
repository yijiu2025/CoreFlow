/**
 * 权限加载器
 * 按 appId 加载用户的角色和权限，用于 Session 数据构建
 */
import { Op } from 'sequelize';
import sequelize from '../db/index.js';

/**
 * 加载用户在指定应用的角色和权限
 * @param {number} userId 用户内部 ID
 * @param {string} appId 应用标识
 * @returns {{ roles: string[], permissions: { allows: string[], denies: string[] } }}
 */
export async function loadUserPermissions(userId, appId) {
  const { Role, UserRole, InlinePolicy } = sequelize.models;

  // 1. 加载角色 (当前应用 + 全局角色)
  const userRoles = await UserRole.findAll({
    where: {
      user_id: userId,
      app_id: { [Op.in]: [appId, 'GLOBAL'] },
      delete_version: 0,
      [Op.or]: [{ expire_at: null }, { expire_at: { [Op.gt]: new Date() } }]
    },
    include: [
      {
        model: Role,
        as: 'role',
        where: { delete_version: 0 },
        required: true
      }
    ]
  });

  const roles = userRoles.map((ur) => ur.role.code);

  // 2. 合并角色策略
  const allows = [];
  const denies = [];

  for (const ur of userRoles) {
    const policy = ur.role.policy;
    if (policy) {
      if (Array.isArray(policy.allows)) allows.push(...policy.allows);
      if (Array.isArray(policy.denies)) denies.push(...policy.denies);
    }
  }

  // 3. 加载内联策略 (当前应用 + 全局)
  const inlinePolicies = await InlinePolicy.findAll({
    where: {
      user_id: userId,
      app_id: { [Op.in]: [appId, 'GLOBAL'] }
    }
  });

  for (const ip of inlinePolicies) {
    const policy = ip.policy;
    if (policy) {
      if (Array.isArray(policy.allows)) allows.push(...policy.allows);
      if (Array.isArray(policy.denies)) denies.push(...policy.denies);
    }
  }

  return {
    roles,
    permissions: { allows, denies }
  };
}
