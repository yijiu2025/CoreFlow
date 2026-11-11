/**
 * 临时密码数据访问层
 *
 * 只负责读写 `user_temp_password`；生成与校验的策略在
 * `app/user/services/temp-password.service.js`。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import crypto from 'node:crypto';
import { getModel } from '../../../framework/persistence/db/index.js';
import { Op } from 'sequelize';

/** 可打印字符集：去掉 0/O/1/l/I 这类易混字符（临时密码要靠人念 / 手抄） */
const SAFE_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * 生成随机明文密码
 *
 * 用 `crypto.randomInt` 而不是 `Math.random`：后者可被预测，等于把凭据交给猜测。
 *
 * @param {number} [length=12] 长度
 * @returns {string} 明文
 */
function generatePlainPassword(length = 12) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SAFE_ALPHABET[crypto.randomInt(0, SAFE_ALPHABET.length)];
  }
  return out;
}

class TempPasswordDao {
  /**
   * 落库一条临时密码
   *
   * @param {object} params 参数
   * @param {number} params.userId 目标用户
   * @param {string} params.passwordHash bcrypt 哈希
   * @param {Date} params.expiresAt 失效时间
   * @param {number} params.maxUses 可用次数
   * @param {number|null} params.createdBy 签发人
   * @param {string|null} params.createdByName 签发人账号快照
   * @param {string|null} params.reason 签发原因
   * @returns {Promise<object>} 记录
   */
  async create({ userId, passwordHash, expiresAt, maxUses, createdBy, createdByName, reason }) {
    const UserTempPassword = getModel('user.UserTempPassword');
    return UserTempPassword.create({
      user_id: userId,
      password_hash: passwordHash,
      expires_at: expiresAt,
      max_uses: maxUses,
      used_count: 0,
      created_by: createdBy ?? null,
      created_by_name: createdByName ?? null,
      reason: reason ?? null
    });
  }

  /**
   * 取某用户**仍可用**的临时密码（未过期、未作废、未用满）
   *
   * 登录时拿到的是候选列表：用户可能同时有不止一条（交接期间换了责任人），
   * 逐条比对哈希即可，不需要"一条对不上就别查了"。
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<object[]>} 候选记录
   */
  async findActiveByUser(userId) {
    const UserTempPassword = getModel('user.UserTempPassword');
    const rows = await UserTempPassword.findAll({
      where: {
        user_id: userId,
        expires_at: { [Op.gt]: new Date() },
        revoked_at: { [Op.is]: null }
      },
      order: [['id', 'DESC']]
    });
    return rows.filter(row => Number(row.used_count) < Number(row.max_uses));
  }

  /**
   * 记一次使用（原子自增，避免并发把次数刷爆）
   *
   * @param {number} id 记录 ID
   * @returns {Promise<boolean>} 是否命中（false = 已被并发用掉 / 已作废）
   */
  async consume(id) {
    const UserTempPassword = getModel('user.UserTempPassword');
    const [affected] = await UserTempPassword.update(
      {
        used_count: sequelizeLiteral('used_count + 1'),
        last_used_at: new Date()
      },
      {
        where: {
          id,
          revoked_at: { [Op.is]: null },
          expires_at: { [Op.gt]: new Date() },
          // 关键：把"还剩次数"放进 WHERE，两个并发请求只有一个能把最后一次用掉
          [Op.and]: [sequelizeLiteral('used_count < max_uses')]
        }
      }
    );
    return affected > 0;
  }

  /**
   * 作废某用户的全部临时密码（签发新密码时先清旧的）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<number>} 作废条数
   */
  async revokeAllByUser(userId) {
    const UserTempPassword = getModel('user.UserTempPassword');
    const [affected] = await UserTempPassword.update(
      { revoked_at: new Date() },
      { where: { user_id: userId, revoked_at: { [Op.is]: null } } }
    );
    return affected;
  }

  /**
   * 该用户当前有效的临时密码（管理端展示用，不含哈希）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<object[]>} 有效记录
   */
  async listActive(userId) {
    const active = await this.findActiveByUser(userId);
    return active.map(row => ({
      id: Number(row.id),
      expires_at: row.expires_at,
      max_uses: Number(row.max_uses),
      used_count: Number(row.used_count),
      created_by_name: row.created_by_name,
      reason: row.reason,
      created_at: row.created_at
    }));
  }

  /**
   * 清理过期记录（定时任务用）
   *
   * @param {number} retentionDays 过期后再保留多少天（审计窗口）
   * @returns {Promise<number>} 删除条数
   */
  async pruneExpired(retentionDays = 7) {
    const UserTempPassword = getModel('user.UserTempPassword');
    const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return UserTempPassword.destroy({ where: { expires_at: { [Op.lt]: before } }, force: true });
  }
}

/**
 * `used_count + 1` 这类表达式不能走对象字面量
 *
 * 单独包一层是为了让 TS/lint 看到的是「明确的 SQL 片段」，也方便日后统一替换。
 *
 * @param {string} expr SQL 片段（仅内部常量拼接，不接受外部输入）
 * @returns {object} Sequelize literal
 */
function sequelizeLiteral(expr) {
  const { literal } = getModel('user.UserTempPassword').sequelize.Sequelize;
  return literal(expr);
}

const tempPasswordDao = new TempPasswordDao();

export { generatePlainPassword };
export default tempPasswordDao;
