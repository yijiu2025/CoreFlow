import sequelize from '../../../db/index.js';

/** 获取 OauthApproval 模型 (延迟加载) */
const getModel = () => sequelize.models.OauthApproval;

class ApprovalDao {
  /**
   * 检查用户是否已授权某应用
   * @param {string} sub 用户 UUID
   * @param {string} appId 应用ID
   * @returns {Promise<object|null>}
   */
  async getEffectiveApproval(sub, appId) {
    const OauthApproval = getModel();
    return await OauthApproval.findOne({
      where: {
        sub,
        app_id: appId, // 使用下划线关联查询底层物理字段
        status: 1 // 必须是正常状态
      }
    });
  }

  /**
   * 保存或更新授权记录 (幂等操作)，并自动授予默认角色
   * @param {object} params
   */
  async saveApproval({ uid, sub, appId, scopes }) {
    const OauthApproval = getModel();
    const userSub = sub || uid; // 兼容并包：允许传入 uid 或 sub，一律映射为 sub
    const t = await sequelize.transaction();
    try {
      const [approval, created] = await OauthApproval.findOrCreate({
        where: { sub: userSub, app_id: appId },
        defaults: {
          sub: userSub,
          app_id: appId,
          scopes, // Natively handles JSON array, no need for JSON.stringify()
          status: 1
        },
        transaction: t
      });

      if (!created) {
        // 如果已存在，仅更新 scopes 和授权时间
        approval.scopes = scopes; // Natively handles JSON array
        approval.status = 1;
        approval.last_auth_at = new Date();
        await approval.save({ transaction: t });
      } else {
        // [新增逻辑]：首次授权，自动授予该应用的默认权限角色
        // 假设我们约定，每个应用下 rank_level=1 的角色为“默认普通用户角色”
        const defaultRole = await sequelize.models.Role.findOne({
          where: { app_id: appId, rank_level: 1 },
          transaction: t
        });

        if (defaultRole) {
          // 获取用户的内部 ID
          const user = await sequelize.models.User.findOne({
            where: { uid: userSub },
            transaction: t
          });
          if (user) {
            // 确保没有重复绑定
            await sequelize.models.UserRole.findOrCreate({
              where: {
                user_id: user.id,
                app_id: appId,
                role_id: defaultRole.id
              },
              defaults: {
                user_id: user.id,
                app_id: appId,
                role_id: defaultRole.id
              },
              transaction: t
            });
          }
        }
      }

      await t.commit();
      return approval;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * 封禁/撤销授权
   */
  async revokeApproval(sub, appId) {
    const OauthApproval = getModel();
    return await OauthApproval.update(
      { status: 0 },
      { where: { sub, app_id: appId } }
    );
  }
}

export default new ApprovalDao();
