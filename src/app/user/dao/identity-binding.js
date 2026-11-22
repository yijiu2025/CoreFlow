/**
 * 第三方账号绑定数据访问层
 *
 * 只负责读写 `user_identities`（绑定关系）；provider 清单与"唯一登录方式"判定在
 * `app/user/services/identity.service.js`。
 *
 * 注意与 `user_identity`（认证凭证表，密码/锁定）区分：后者是登录凭据，这里是
 * 第三方平台的绑定关系，两张表不通用。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { getModel } from '../../../framework/persistence/db/index.js';

/**
 * 取绑定模型（延迟到调用时）
 *
 * @returns {object} UserIdentityBinding 模型
 */
function model() {
  return getModel('user.UserIdentityBinding');
}

/**
 * 取认证凭证模型（只用于"还有没有别的登录方式"这一判断）
 *
 * @returns {object} UserIdentity 模型
 */
function credentialModel() {
  return getModel('user.UserIdentity');
}

/**
 * 某用户的全部绑定
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<object[]>} 记录
 */
function listByUser(userId) {
  return model().findAll({
    where: { user_id: userId },
    order: [['id', 'DESC']]
  });
}

/**
 * 按 id + 用户查绑定（越权与不存在返回同一个 null，不泄露"别人绑了什么"）
 *
 * @param {object} params 参数
 * @param {number} params.userId 用户 ID
 * @param {number} params.id 绑定 ID
 * @returns {Promise<object|null>} 记录
 */
function findByIdAndUser({ userId, id }) {
  return model().findOne({ where: { id, user_id: userId } });
}

/**
 * 删除一条绑定（已用 `findByIdAndUser` 校验归属后调用）
 *
 * @param {object} row 记录
 * @returns {Promise<void>}
 */
function removeRow(row) {
  return row.destroy();
}

/**
 * 某用户的绑定数量（判断"这是不是最后一条"）
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<number>} 数量
 */
function countByUser(userId) {
  return model().count({ where: { user_id: userId } });
}

/**
 * 该用户还有多少条未注销的认证凭证
 *
 * 用来判断"解绑之后他还能不能登录" —— 0 个凭证 + 这是最后一条绑定 = 会把人锁在门外。
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<number>} 数量
 */
function countActiveCredentials(userId) {
  return credentialModel().count({ where: { user_id: userId, delete_version: 0 } });
}

export { listByUser, findByIdAndUser, removeRow, countByUser, countActiveCredentials };
