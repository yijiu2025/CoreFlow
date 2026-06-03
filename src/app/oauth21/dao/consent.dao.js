/**
 * OAuth 用户授权同意数据访问层
 *
 * 提供用户授权同意记录的查增删操作。
 * 已升级适配统一 IAM 规范：底层的 user_id 列已变更为 sub，以存放 User.uid。
 */
import sequelize from '../../../db/index.js';

/** 获取 OauthConsent 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthConsent;

const ConsentDao = {
  /**
   * 查找用户对某客户端的授权同意记录
   * @param {string} sub 用户唯一标识 (主系统 User.uid)
   * @param {string} clientId 客户端 ID
   * @returns {Promise<object|null>} 授权同意记录或 null
   */
  async find(sub, clientId) {
    const model = getModel();
    const consent = await model.findOne({
      where: { sub, client_id: clientId }
    });
    return consent ? consent.toJSON() : null;
  },

  /**
   * 保存用户授权同意记录
   * @param {string} sub 用户唯一标识 (主系统 User.uid)
   * @param {string} clientId 客户端 ID
   * @param {string[]} scopes 已授权的权限范围列表
   */
  async save(sub, clientId, scopes) {
    const model = getModel();
    await model.upsert({
      sub,
      client_id: clientId,
      scopes
    });
  },

  /**
   * 删除用户授权同意记录
   * @param {string} sub 用户唯一标识 (主系统 User.uid)
   * @param {string} clientId 客户端 ID
   */
  async remove(sub, clientId) {
    const model = getModel();
    await model.destroy({
      where: { sub, client_id: clientId }
    });
  }
};

export default ConsentDao;
