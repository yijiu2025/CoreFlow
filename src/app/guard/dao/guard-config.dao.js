/**
 * 守卫配置数据访问层
 * 封装数据库读写操作，使用 upsert + 乐观锁实现原子写入
 * 版本冲突时自动重试（加载最新版本后重新写入）
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import sequelize from '../../../db/index.js';

/** 版本冲突最大重试次数 */
const MAX_RETRY = 3;

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
      // 列类型为 longtext，Sequelize 返回字符串而非已解析对象，需要手动解析
      let configs = row.configs || {};
      if (typeof configs === 'string') {
        try {
          configs = JSON.parse(configs);
        } catch {
          configs = {};
        }
      }
      return {
        configs,
        version: row.version || 0
      };
    }

    return { configs: {}, version: 0 };
  }

  /**
   * 原子写入配置到数据库
   * 使用 findOrCreate + 乐观锁 version 校验确保写入原子性
   * 版本冲突时自动重新加载最新版本并重试（最多 MAX_RETRY 次）
   *
   * @param {object} configs - 完整配置树
   * @param {number} currentVersion - 当前版本号（用于乐观锁校验）
   * @param {number} [retryCount=0] - 当前重试次数（内部使用）
   * @returns {Promise<number>} 新版本号
   * @throws {Error} 重试耗尽后仍版本冲突时抛出
   */
  async saveToDB(configs, currentVersion, retryCount = 0) {
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
        // 版本冲突：自动重新加载最新版本并重试
        if (retryCount < MAX_RETRY) {
          const latest = await this.loadFromDB();
          return this.saveToDB(configs, latest.version, retryCount + 1);
        }
        throw new Error(`版本冲突: 当前版本=${currentVersion}，数据库版本已被其他进程修改（已重试 ${MAX_RETRY} 次）`);
      }
    }

    return newVersion;
  }
}

export default new GuardConfigDao();
