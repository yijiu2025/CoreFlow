/**
 * OAuth 刷新令牌数据访问层
 *
 * 提供刷新令牌的保存、查找、吊销操作。
 * 支持令牌轮换（revoke 旧令牌 + save 新令牌）和批量吊销。
 * 访问令牌为无状态 JWT，不需要持久化，此处仅管理刷新令牌。
 * 底层通过 Sequelize 模型访问 oauth_tokens 表。
 */
import { Op } from 'sequelize';
import sequelize from '../../db/index.js';

/** 获取 OauthToken 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthToken;

const TokenDao = {
  /**
   * 保存刷新令牌
   * @param {string} refreshToken 刷新令牌值
   * @param {object} data 令牌数据
   * @param {string} data.sub 主体 ID（用户 ID 或客户端 ID）
   * @param {string} data.client_id 客户端 ID
   * @param {string} [data.scope] 权限范围
   * @param {number} [data.expiresIn] 过期时间（秒），默认 86400
   */
  async save(refreshToken, data) {
    const model = getModel();
    const expiresIn = data.expiresIn || 86400;
    await model.create({
      refresh_token: refreshToken,
      sub: data.sub,
      client_id: data.client_id,
      scope: data.scope,
      revoked: false,
      expires_at: new Date(Date.now() + expiresIn * 1000)
    });
  },

  /**
   * 查找刷新令牌
   * @param {string} refreshToken 刷新令牌值
   * @returns {Promise<object|null>} 令牌数据或 null
   */
  async find(refreshToken) {
    const model = getModel();
    const token = await model.findOne({
      where: { refresh_token: refreshToken }
    });
    return token ? token.toJSON() : null;
  },

  /**
   * 吊销单个刷新令牌
   * @param {string} refreshToken 刷新令牌值
   */
  async revoke(refreshToken) {
    const model = getModel();
    await model.update(
      { revoked: true },
      { where: { refresh_token: refreshToken } }
    );
  },

  /**
   * 吊销某用户的所有刷新令牌
   * @param {string} userId 用户 ID
   */
  async revokeAllForUser(userId) {
    const model = getModel();
    await model.update(
      { revoked: true },
      { where: { sub: userId } }
    );
  },

  /**
   * 吊销某客户端的所有刷新令牌
   * @param {string} clientId 客户端 ID
   */
  async revokeAllForClient(clientId) {
    const model = getModel();
    await model.update(
      { revoked: true },
      { where: { client_id: clientId } }
    );
  },

  /**
   * 清理过期和已吊销的刷新令牌
   * @returns {Promise<number>} 删除的记录数
   */
  async cleanup() {
    const model = getModel();
    return model.destroy({
      where: {
        [Op.or]: [
          { expires_at: { [Op.lt]: new Date() } },
          { revoked: true }
        ]
      }
    });
  }
};

export default TokenDao;
