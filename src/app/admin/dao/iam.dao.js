import sequelize from '../../../db/index.js';
import { QueryTypes } from 'sequelize';

class IamDao {
  /**
   * 获取某应用下的最高职级 (权重压制判定核心)
   */
  async getMemberLevel(uid, appId) {
    const user = await sequelize.models.User.findOne({ where: { uid } });
    if (!user) return 0;

    const highestRole = await sequelize.models.UserRole.findOne({
      where: { user_id: user.id, app_id: [appId, 'GLOBAL'] },
      order: [['role_id', 'DESC']],
      include: [
        { model: sequelize.models.Role, as: 'role', attributes: ['rank_level'] }
      ]
    });
    return highestRole?.role?.rank_level || 0;
  }

  /**
   * 获取当前管理员有权分配的角色列表
   */
  async getAssignableRoles(adminUid, targetAppId) {
    const adminLevel = await this.getMemberLevel(
      adminUid,
      targetAppId || 'GLOBAL'
    );
    const { Op } = sequelize.Sequelize;
    const where = { rank_level: { [Op.lte]: adminLevel } };

    if (targetAppId) {
      where.app_id = { [Op.in]: [targetAppId, 'GLOBAL'] };
    }

    return await sequelize.models.Role.findAll({
      where,
      order: [['rank_level', 'DESC']]
    });
  }

  /**
   * 获取当前管理员有权管理的用户列表 (同级或低级)
   */
  async getManageableUsers(adminUid, keyword = '') {
    const adminLevel = await this.getMemberLevel(adminUid, 'GLOBAL');

    // 采用下划线表名
    const query = `
      SELECT 
        u.uid, u.username, u.email, u.status, u.avatar,
        COALESCE(MAX(r.rank_level), 0) AS max_level,
        GROUP_CONCAT(DISTINCT r.name) AS roles
      FROM \`user_user\` u
      LEFT JOIN \`user_app_user_role\` ur ON u.id = ur.user_id AND ur.deletedAt IS NULL
      LEFT JOIN \`user_role\` r ON ur.role_id = r.id AND r.deletedAt IS NULL
      WHERE (u.username LIKE :keyword OR u.email LIKE :keyword) AND u.deletedAt IS NULL
      GROUP BY u.id
      HAVING max_level <= :adminLevel
      ORDER BY max_level DESC, u.id DESC
    `;

    return await sequelize.query(query, {
      replacements: { adminLevel, keyword: `%${keyword}%` },
      type: QueryTypes.SELECT
    });
  }

  /**
   * 分配角色给用户
   */
  async assignRole(adminUid, targetUid, targetRoleId, appId, grantedByUid) {
    const [adminLevel, targetUserLevel] = await Promise.all([
      this.getMemberLevel(adminUid, appId),
      this.getMemberLevel(targetUid, appId)
    ]);

    const targetRole = await sequelize.models.Role.findByPk(targetRoleId);
    if (!targetRole) throw new Error('ROLE_NOT_FOUND: 目标角色不存在');

    if (adminLevel <= targetRole.rank_level) {
      throw new Error('FORBIDDEN: 您无法委派等级高于或等于自己的角色');
    }

    if (adminLevel <= targetUserLevel) {
      throw new Error('FORBIDDEN: 您无法对等级高于或等于自己的用户进行操作');
    }

    const targetUser = await sequelize.models.User.findOne({
      where: { uid: targetUid }
    });
    const grantor = await sequelize.models.User.findOne({
      where: { uid: adminUid }
    });

    return await sequelize.models.UserRole.findOrCreate({
      where: { user_id: targetUser.id, app_id: appId, role_id: targetRoleId },
      defaults: {
        user_id: targetUser.id,
        app_id: appId,
        role_id: targetRoleId,
        granted_by: grantor?.id
      }
    });
  }

  /**
   * 更新用户的 JSON 内联策略 (PBAC 核心)
   */
  async updateInlinePolicy(adminUid, targetUid, appId, policyDoc) {
    const [adminLevel, targetUserLevel] = await Promise.all([
      this.getMemberLevel(adminUid, appId),
      this.getMemberLevel(targetUid, appId)
    ]);

    if (adminLevel <= targetUserLevel) {
      throw new Error('FORBIDDEN: 您无法修改高级别用户的策略');
    }

    const targetUser = await sequelize.models.User.findOne({
      where: { uid: targetUid }
    });
    if (!targetUser) throw new Error('USER_NOT_FOUND: 目标用户不存在');

    const [policy, created] = await sequelize.models.InlinePolicy.findOrCreate({
      where: { user_id: targetUser.id, app_id: appId },
      defaults: { user_id: targetUser.id, app_id: appId, policy: policyDoc }
    });

    if (!created) {
      policy.policy = policyDoc;
      await policy.save();
    }

    return policy;
  }

  /**
   * [PBAC 核心逻辑]：提取并合并用户的所有策略
   */
  async buildUserEffectivePolicy(uid, appId) {
    const user = await sequelize.models.User.findOne({ where: { uid } });
    if (!user) return { allows: [], denies: [] };

    // 1. 提取角色策略
    const roles = await sequelize.query(
      `
      SELECT r.policy 
      FROM user_role r
      JOIN user_app_user_role ur ON r.id = ur.role_id
      WHERE ur.user_id = :userId AND (ur.app_id = :appId OR ur.app_id = 'GLOBAL') 
      AND ur.deletedAt IS NULL AND r.deletedAt IS NULL
      AND (ur.expire_at IS NULL OR ur.expire_at > NOW())
    `,
      { replacements: { userId: user.id, appId }, type: QueryTypes.SELECT }
    );

    // 2. 提取个人内联策略
    const inlinePolicies = await sequelize.models.InlinePolicy.findAll({
      where: { user_id: user.id, app_id: [appId, 'GLOBAL'] }
    });

    const effectiveAllows = new Set();
    const effectiveDenies = new Set();

    const allPolicies = [
      ...roles.map((r) => r.policy),
      ...inlinePolicies.map((p) => p.policy)
    ].map((p) => (typeof p === 'string' ? JSON.parse(p) : p));

    for (const doc of allPolicies) {
      if (!doc || !doc.Statement) continue;
      for (const stmt of doc.Statement) {
        if (stmt.Effect === 'Allow')
          stmt.Action.forEach((a) => effectiveAllows.add(a));
        if (stmt.Effect === 'Deny')
          stmt.Action.forEach((a) => effectiveDenies.add(a));
      }
    }

    return {
      allows: Array.from(effectiveAllows),
      denies: Array.from(effectiveDenies)
    };
  }
}

export default new IamDao();
