/**
 * OAuth 刷新令牌数据访问层
 *
 * 提供刷新令牌的保存、查找、吊销操作。
 * 支持令牌轮换（revoke 旧令牌 + save 新令牌）和批量吊销。
 * 访问令牌为无状态 JWT，不需要持久化，此处仅管理刷新令牌。
 * 底层通过 Sequelize 模型访问 oauth_tokens 表。
 *
 * 安全：refresh_token 以 sha256 哈希入库（与 Session 的 sid 一致），
 * 避免数据库泄露导致 refresh token 直接可用。调用方传明文，DAO 内部统一哈希。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { Op } from 'sequelize';
import crypto from 'node:crypto';
import sequelize from '../../../framework/persistence/db/index.js';

/** 获取 OauthToken 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthToken;

/** refresh_token → sha256 哈希（集中一处，避免散落） */
function rtHash(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

const TokenDao = {
  /**
   * 保存刷新令牌（明文哈希后入库）
   * @param {string} refreshToken 明文刷新令牌值
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
      refresh_token: rtHash(refreshToken),
      sub: data.sub,
      client_id: data.client_id,
      scope: data.scope,
      revoked: false,
      expires_at: new Date(Date.now() + expiresIn * 1000)
    });
  },

  /**
   * 查找刷新令牌（明文哈希后查询，仅返回未过期且未吊销的有效令牌）
   * @param {string} refreshToken 明文刷新令牌值
   * @returns {Promise<object|null>} 令牌数据或 null
   */
  async find(refreshToken) {
    const model = getModel();
    const token = await model.findOne({
      where: {
        refresh_token: rtHash(refreshToken),
        revoked: false,
        expires_at: { [Op.gt]: new Date() }
      }
    });
    return token ? token.toJSON() : null;
  },

  /**
   * 吊销单个刷新令牌（明文哈希后定位）
   * @param {string} refreshToken 明文刷新令牌值
   * @param {string} [clientId] 归属客户端（RFC 7009 §2.1：撤销请求方必须与令牌
   *   签发方一致）。传入时只在 client_id 匹配的行上生效——其他客户端（哪怕拿到
   *   token 值）无法吊销不属于自己的令牌；不传则不约束（内部轮转路径，调用方
   *   已自行校验归属）。
   */
  async revoke(refreshToken, clientId) {
    const model = getModel();
    const where = { refresh_token: rtHash(refreshToken) };
    if (clientId) where.client_id = clientId;
    await model.update({ revoked: true }, { where });
  },

  /**
   * 判断明文 refresh_token 是否**已吊销**（用于盗用检测：已轮转的旧令牌被再次使用 = 盗用）
   *
   * 🔴 必须同时过滤 `revoked: true`（2026-11-08 修复）：
   * 旧实现只按哈希查，把"**过期**但从未轮转"的令牌也返回了 ——
   * 而 `find()` 是过滤过期的（查不到 → 走盗用分支）→ 于是一次普通的
   * "用过期 refresh_token 刷新"会被判成盗用，触发 `revokeAllForUser`，
   * 把该用户**所有设备**的 refresh token 全吊销。反过来，任何持有该用户
   * 历史令牌值的人也能主动触发这次全量吊销（拒绝服务）。
   *
   * @param {string} refreshToken 明文刷新令牌值
   * @returns {Promise<object|null>} 已吊销的令牌记录（含 sub/client_id）或 null
   */
  async findRevoked(refreshToken) {
    const model = getModel();
    const token = await model.findOne({ where: { refresh_token: rtHash(refreshToken), revoked: true } });
    return token ? token.toJSON() : null;
  },

  /**
   * 吊销某用户的所有刷新令牌（盗用检测命中或禁用账号时调用）
   * @param {string} userId 用户 ID
   */
  async revokeAllForUser(userId) {
    const model = getModel();
    await model.update({ revoked: true }, { where: { sub: userId } });
  },

  /**
   * 吊销某客户端的所有刷新令牌
   * @param {string} clientId 客户端 ID
   */
  async revokeAllForClient(clientId) {
    const model = getModel();
    await model.update({ revoked: true }, { where: { client_id: clientId } });
  },

  /**
   * 清理过期和已吊销的刷新令牌
   * @returns {Promise<number>} 删除的记录数
   */
  async cleanup() {
    const model = getModel();
    return model.destroy({
      where: {
        [Op.or]: [{ expires_at: { [Op.lt]: new Date() } }, { revoked: true }]
      }
    });
  }
};

export default TokenDao;
