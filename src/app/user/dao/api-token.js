/**
 * 访问令牌数据访问层
 *
 * 只负责读写 `user_api_tokens`；签发、上限、吊销语义在
 * `app/user/services/token.service.js`。
 *
 * 为什么单独一层：`model-access-boundary` 关卡禁止 service 直接 `getModel`
 * （模型访问必须收在 dao，便于审计"这张表被谁改过"）。service 只保留策略。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { Op } from 'sequelize';
import { getModel } from '../../../framework/persistence/db/index.js';

/**
 * 取模型（延迟到调用时：模型在 loader 阶段才注册）
 *
 * @returns {object} UserApiToken 模型
 */
function model() {
  return getModel('user.UserApiToken');
}

/**
 * 某用户所有未吊销的令牌（新→旧）
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<object[]>} 记录
 */
function listActiveByUser(userId) {
  return model().findAll({
    where: { user_id: userId, revoked_at: { [Op.is]: null } },
    order: [['id', 'DESC']]
  });
}

/**
 * 某用户未吊销令牌的数量（用于上限判定）
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<number>} 数量
 */
function countActiveByUser(userId) {
  return model().count({
    where: { user_id: userId, revoked_at: { [Op.is]: null } }
  });
}

/**
 * 插入一条令牌
 *
 * @param {object} payload 字段（含 hash 与 prefix，明文不进这里）
 * @returns {Promise<object>} 记录
 */
function createRow(payload) {
  return model().create(payload);
}

/**
 * 按 hash 查一条未吊销的令牌
 *
 * @param {string} tokenHash sha256 摘要
 * @returns {Promise<object|null>} 记录
 */
function findActiveByHash(tokenHash) {
  return model().findOne({
    where: { token_hash: tokenHash, revoked_at: { [Op.is]: null } }
  });
}

/**
 * 软吊销：where 同时带 id 与 user_id，拿别人的 id 也改不动
 *
 * @param {object} params 参数
 * @param {number} params.userId 用户 ID
 * @param {number} params.id 令牌 ID
 * @returns {Promise<number>} 受影响行数
 */
async function revokeById({ userId, id }) {
  const [affected] = await model().update(
    { revoked_at: new Date() },
    { where: { id, user_id: userId, revoked_at: { [Op.is]: null } } }
  );
  return affected;
}

/**
 * 记录最近使用时间（失败时由调用方决定是否忽略）
 *
 * @param {object} row 记录
 * @param {Date} at 时间
 * @returns {Promise<void>}
 */
function touchLastUsed(row, at) {
  return row.update({ last_used_at: at });
}

export { listActiveByUser, countActiveByUser, createRow, findActiveByHash, revokeById, touchLastUsed };
