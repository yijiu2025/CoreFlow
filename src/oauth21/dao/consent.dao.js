/**
 * OAuth 用户授权同意数据访问层
 *
 * 提供用户授权同意记录的查增删操作。
 * 记录用户对某个客户端已授权的 scope，避免重复授权。
 * 底层通过 Sequelize 模型访问 oauth_consents 表。
 */
import sequelize from '../../db/index.js';

/** 获取 OauthConsent 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthConsent;

const ConsentDao = {
  /**
   * 查找用户对某客户端的授权同意记录
   * @param {string} userId 用户 ID
   * @param {string} clientId 客户端 ID
   * @returns {Promise<object|null>} 授权同意记录或 null
   */
  async find(userId, clientId) {
    const model = getModel();
    const consent = await model.findOne({
      where: { user_id: userId, client_id: clientId }
    });
    return consent ? consent.toJSON() : null;
  },

  /**
   * 保存用户授权同意记录
   * @param {string} userId 用户 ID
   * @param {string} clientId 客户端 ID
   * @param {string[]} scopes 已授权的权限范围列表
   */
  async save(userId, clientId, scopes) {
    const model = getModel();
    await model.upsert({
      user_id: userId,
      client_id: clientId,
      scopes
    });
  },

  /**
   * 删除用户授权同意记录
   * @param {string} userId 用户 ID
   * @param {string} clientId 客户端 ID
   */
  async remove(userId, clientId) {
    const model = getModel();
    await model.destroy({
      where: { user_id: userId, client_id: clientId }
    });
  }
};

export default ConsentDao;
