/**
 * OAuth 授权码数据访问层
 *
 * 提供授权码的保存、查找、消费操作。
 * 授权码为一次性使用，消费后标记 consumed=true。
 * 底层通过 Sequelize 模型访问 oauth_codes 表。
 */
import { Op } from 'sequelize';
import sequelize from '../../db/index.js';

/** 获取 OauthCode 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthCode;

const CodeDao = {
  /**
   * 保存授权码
   * @param {string} code 授权码值
   * @param {object} data 授权码数据
   * @param {string} data.client_id 客户端 ID
   * @param {string} data.sub 用户 ID
   * @param {string} data.redirect_uri 回调地址
   * @param {string} [data.scope] 权限范围
   * @param {string} [data.code_challenge] PKCE challenge
   * @param {string} [data.code_challenge_method] PKCE method
   * @param {string} [data.nonce] OIDC nonce
   * @param {number} [data.expiresIn] 过期时间（秒），默认 600
   */
  async save(code, data) {
    const model = getModel();
    const expiresIn = data.expiresIn || 600;
    await model.create({
      code,
      client_id: data.client_id,
      sub: data.sub,
      redirect_uri: data.redirect_uri,
      scope: data.scope,
      code_challenge: data.code_challenge,
      code_challenge_method: data.code_challenge_method || 'S256',
      nonce: data.nonce,
      consumed: false,
      expires_at: new Date(Date.now() + expiresIn * 1000)
    });
  },

  /**
   * 查找授权码（不消耗）
   * @param {string} code 授权码值
   * @returns {Promise<object|null>} 授权码数据或 null
   */
  async find(code) {
    const model = getModel();
    const entry = await model.findByPk(code);
    return entry ? entry.toJSON() : null;
  },

  /**
   * 消费授权码（一次性使用，带重放检测）
   * @param {string} code 授权码值
   * @returns {Promise<object|null>} 授权码数据或 null（已消费/过期/不存在）
   */
  async consume(code) {
    const model = getModel();
    const entry = await model.findByPk(code);
    if (!entry) return null;

    const data = entry.toJSON();

    // 已被消费 → 重放攻击检测
    if (data.consumed) {
      return { ...data, replay_detected: true };
    }

    // 已过期
    if (new Date() > new Date(data.expires_at)) {
      return null;
    }

    // 标记为已消费
    await entry.update({ consumed: true });
    return { ...data, consumed: true };
  },

  /**
   * 清理过期授权码
   * @returns {Promise<number>} 删除的记录数
   */
  async cleanup() {
    const model = getModel();
    return model.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() }
      }
    });
  }
};

export default CodeDao;
