/**
 * PoseCraft 用户个性设置 DAO
 * 只负责 settings 字段的读写与合并，不解析字段语义
 *
 * @author Claude
 * @since 2026-07-13
 */
import sequelize from '../../../db/index.js';

class SettingsDao {
  /**
   * 获取 UserSettings 模型
   * @returns {Model}
   */
  getSettingsModel() {
    return sequelize.models.UserSettings;
  }

  /**
   * 读取指定用户的 settings（对象），未配置返回 {}
   * @param {number} userId - 系统 User.id
   */
  async getByUserId(userId) {
    const Model = this.getSettingsModel();
    const row = await Model.findOne({ where: { user_id: userId } });
    if (!row || !row.settings) return {};
    try {
      return JSON.parse(row.settings);
    } catch {
      // 脏数据兜底：解析失败返回空对象
      return {};
    }
  }

  /**
   * 增量合并更新：只更新前端传入的字段，保留其余字段
   * @param {number} userId - 系统 User.id
   * @param {object} partial - 要合并的对象，如 { showTemplate: false }
   */
  async mergeUpdate(userId, partial) {
    if (!partial || typeof partial !== 'object') return {};
    const Model = this.getSettingsModel();

    const row = await Model.findOne({ where: { user_id: userId } });
    const current = row?.settings ? JSON.parse(row.settings) : {};
    const merged = { ...current, ...partial };

    if (row) {
      await row.update({ settings: JSON.stringify(merged) });
    } else {
      await Model.create({ user_id: userId, settings: JSON.stringify(merged) });
    }
    return merged;
  }
}

export default new SettingsDao();
