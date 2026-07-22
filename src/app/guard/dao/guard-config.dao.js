/**
 * 守卫配置数据访问层
 * 封装数据库读写操作，使用 upsert + 乐观锁实现原子写入
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import sequelize from '../../../db/index.js';

class GuardConfigDao {
  /**
   * 从数据库加载持久化配置
   * 查询首条记录，返回 configs 数据和版本号
   *
   * @returns {Promise<{configs: object, version: number}>}
   */
  async loadFromDB() {
    const Model = sequelize.models.GuardConfig;
    const row = await Model.findOne({ order: [['id', 'ASC']] });

    if (row) {
      return {
        configs: row.configs || {},
        version: row.version || 0
      };
    }

    return { configs: {}, version: 0 };
  }

  /**
   * 原子写入配置到数据库
   * 使用 findOrCreate + 乐观锁 version 校验确保写入原子性
   * 版本冲突时抛出异常，由调用方决定重试或放弃
   *
   * @param {object} configs - 完整配置树
   * @param {number} currentVersion - 当前版本号（用于乐观锁校验）
   * @returns {Promise<number>} 新版本号
   * @throws {Error} 版本冲突或数据库写入失败时抛出
   */
  async saveToDB(configs, currentVersion) {
    const Model = sequelize.models.GuardConfig;
    const newVersion = currentVersion + 1;

    const [, created] = await Model.findOrCreate({
      where: { id: 1 },
      defaults: { configs, version: newVersion }
    });

    if (!created) {
      const [affected] = await Model.update(
        { configs, version: newVersion },
        {
          where: { id: 1, version: currentVersion },
          limit: 1
        }
      );

      if (affected === 0) {
        throw new Error(`版本冲突: 当前版本=${currentVersion}，数据库版本已被其他进程修改`);
      }
    }

    return newVersion;
  }
}

export default new GuardConfigDao();
