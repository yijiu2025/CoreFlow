/**
 * console 用户资料数据访问层（`console_user_profile`）
 *
 * 这张表只属于后台：`user_user` 是共享身份表，那里的 username / avatar 是全局身份；
 * "在后台里显示成什么名字、用什么头像、偏好哪套配色"是展示层选择，换个应用想显示
 * 另一套也合理。所以它一用户一行，字段为空时由调用方回落到全局值。
 *
 * 🔴 这里不做偏好键的白名单校验 —— 哪些键允许写是**业务规则**（见 session.js 的
 *    `normalizePrefs`），放进 DAO 会让"表怎么存"和"什么值合法"混在一起。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { getModel } from '../../../framework/persistence/db/index.js';

class ProfileDao {
  /**
   * 读取某用户的 console 资料行
   *
   * @param {number} userId 用户内部 ID
   * @returns {Promise<object|null>} 原始行（不存在时 null）
   */
  async find(userId) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return null;
    return getModel('ConsoleUserProfile').findOne({ where: { user_id: id }, raw: true });
  }

  /**
   * 写入部分字段（行不存在时先建）
   *
   * 用 `findOrCreate` 而不是 `upsert`：upsert 在 MySQL 下会整行覆盖，
   * 只改昵称时会把偏好一起清掉。
   *
   * @param {number} userId 用户内部 ID
   * 🔴 `preferences` 是 JSON 列，这里**原样写入**不做序列化：调用方必须传对象。
   *    传字符串会被当成 JSON 字符串值存进去（双重编码），而业务侧 `normalizePrefs`
   *    之所以要兼容字符串形态，正是因为历史上出现过这种脏数据 —— 别再造新的。
   *
   * @param {object} fields 要写的字段（nickname / avatar / preferences）
   * @returns {Promise<object|null>} 写入后的原始行（ID 非法时 null）
   */
  async patch(userId, fields = {}) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return null;

    const Profile = getModel('ConsoleUserProfile');
    const [record] = await Profile.findOrCreate({
      where: { user_id: id },
      defaults: { user_id: id, nickname: null, avatar: null, preferences: {} }
    });

    const writable = ['nickname', 'avatar', 'preferences'];
    let dirty = false;
    for (const key of writable) {
      if (!(key in fields)) continue;
      record[key] = fields[key];
      dirty = true;
    }
    if (dirty) await record.save();

    // 回原始行而不是 Sequelize 实例：调用方不该拿着实例继续 `.save()`
    return record.get({ plain: true });
  }
}

const profileDao = new ProfileDao();

export default profileDao;
