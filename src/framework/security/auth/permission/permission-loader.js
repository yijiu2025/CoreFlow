/**
 * 权限加载器
 *
 * 按 appId 加载用户在该应用下的角色和权限，用于 Session 数据构建。
 * 聚合角色策略（Role.policy）和内联策略（InlinePolicy），输出统一的 allows/denies 权限集合。
 *
 * 加载逻辑：
 * 1. 查询当前应用 + GLOBAL 角色（排除已过期的 UserRole）
 * 2. GLOBAL superadmin 自动获得各应用级超管权限（{appId}_admin）
 * 3. 查询内联策略（用户级自定义权限）
 * 4. 合并所有策略 → { roles, permissions: { allows, denies } }
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
import { Op } from 'sequelize';
import { getModel } from '../../../persistence/db/index.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.auth.permission-loader');

/**
 * 从策略文档中提取权限
 *
 * 支持两种格式：
 * 1. Statement 格式: { Statement: [{ Effect: 'Allow', Action: ['fw:admin:*'] }] }
 * 2. 直接格式: { allows: ['fw:admin:*'], denies: [] }
 *
 * @param {object|string} policy - 策略文档（对象或 JSON 字符串）
 * @param {string[]} allows - 允许权限数组（引用传递，直接追加）
 * @param {string[]} denies - 拒绝权限数组（引用传递，直接追加）
 */
function extractPermissions(policy, allows, denies) {
  if (!policy) return;

  // 兼容 JSON 字符串格式；解析失败必须留痕（策略 JSON 损坏 → 权限静默缺失，极难排查）
  if (typeof policy === 'string') {
    try {
      policy = JSON.parse(policy);
    } catch (err) {
      log.warn('⚠️ [Permission] 策略 JSON 解析失败，该策略被跳过:', err.message);
      return;
    }
  }

  // 格式 1: Statement 数组
  if (Array.isArray(policy.Statement)) {
    for (const stmt of policy.Statement) {
      // Action 缺失/为 null 时跳过该语句（原实现会 push undefined 污染 allows）
      const raw = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
      const actions = raw.filter(a => typeof a === 'string' && a.length > 0);
      if (actions.length === 0) continue;
      if (stmt.Effect === 'Allow') {
        allows.push(...actions);
      } else if (stmt.Effect === 'Deny') {
        denies.push(...actions);
      }
    }
    return;
  }

  // 格式 2: 直接 allows/denies 数组
  if (Array.isArray(policy.allows)) allows.push(...policy.allows);
  if (Array.isArray(policy.denies)) denies.push(...policy.denies);
}

/**
 * 加载用户在指定应用的角色和权限
 * @param {number} userId 用户内部 ID
 * @param {string} appId 应用标识
 * @returns {{ roles: string[], permissions: { allows: string[], denies: string[] } }}
 */
async function loadUserPermissions(userId, appId) {
  const Role = getModel('Role');
  const UserRole = getModel('UserRole');
  const InlinePolicy = getModel('InlinePolicy');

  // 1. 加载角色 (当前应用 + 全局角色，排除其他应用的角色)
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
        where: {
          delete_version: 0,
          app_id: { [Op.in]: [appId, 'GLOBAL'] }
        },
        required: true
      }
    ]
  });

  let roles = userRoles.map(ur => ur.role.code);

  // 2. 合并角色策略
  const allows = [];
  const denies = [];

  for (const ur of userRoles) {
    extractPermissions(ur.role.policy, allows, denies);
  }

  // 2.5. GLOBAL superadmin 自动获得应用级超管权限
  if (roles.includes('superadmin') && appId !== 'GLOBAL') {
    const appAdminRole = `${appId}_admin`;
    if (!roles.includes(appAdminRole)) {
      roles.push(appAdminRole);
      const adminRole = await Role.findOne({
        where: { code: appAdminRole, app_id: appId, delete_version: 0 }
      });
      if (adminRole?.policy) {
        extractPermissions(adminRole.policy, allows, denies);
      }
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
    extractPermissions(ip.policy, allows, denies);
  }

  return {
    roles,
    permissions: { allows, denies }
  };
}

export { loadUserPermissions };
