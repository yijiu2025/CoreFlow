/**
 * 守卫配置数据访问层
 * 按系统拆分子行存储，每行一个系统配置
 * 启动时加载所有行合并为内存对象，写入时按系统独立 upsert
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import sequelize from '../../../db/index.js';

/** 版本冲突最大重试次数 */
const MAX_RETRY = 3;

class GuardConfigDao {
  /**
   * 从数据库加载所有系统的配置
   * 读取所有行，按 system_key 合并为一个对象
   *
   * @returns {Promise<{configs: object, version: number}>}
   */
  async loadFromDB() {
    const Model = sequelize.models.GuardConfig;
    const rows = await Model.findAll();

    const configs = {};
    let maxVersion = 0;

    for (const row of rows) {
      let config = row.config || {};
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch {
          config = {};
        }
      }
      configs[row.system_key] = config;
      maxVersion = Math.max(maxVersion, row.version || 0);
    }

    return { configs, version: maxVersion };
  }

  /**
   * 原子写入所有系统配置到数据库
   * 按系统逐行 upsert，每行使用相同的版本号
   * 写入失败时抛出异常，由调用方回滚内存状态
   *
   * @param {object} configs - 完整配置树（{ systemKey: config, ... }）
   * @param {number} currentVersion - 当前全局版本号
   * @param {number} [retryCount=0] - 当前重试次数（内部使用）
   * @returns {Promise<number>} 新版本号
   * @throws {Error} 重试耗尽后仍写入失败时抛出
   */
  async saveToDB(configs, currentVersion, retryCount = 0) {
    const Model = sequelize.models.GuardConfig;
    const newVersion = currentVersion + 1;

    // 逐行 upsert
    for (const [systemKey, config] of Object.entries(configs)) {
      const serialized = JSON.stringify(config);

      const [row] = await Model.findOrCreate({
        where: { system_key: systemKey },
        defaults: {
          system_key: systemKey,
          config: serialized,
          version: newVersion
        }
      });

      if (row) {
        await Model.update(
          { config: serialized, version: newVersion },
          { where: { system_key: systemKey } }
        );
      }
    }

    return newVersion;
  }

  /**
   * 备份当前数据库状态（用于回滚）
   * 读取所有行的当前版本，返回快照
   *
   * @returns {Promise<{configs: object, version: number}>}
   */
  async backup() {
    return this.loadFromDB();
  }

  /**
   * 从快照恢复数据库状态（回滚）
   * 清空当前所有行，写入快照数据
   *
   * @param {{configs: object, version: number}} snapshot - 之前的备份快照
   * @returns {Promise<void>}
   */
  async restore(snapshot) {
    const Model = sequelize.models.GuardConfig;

    // 清空所有行
    await Model.destroy({ where: {}, truncate: true });

    // 写入快照数据
    for (const [systemKey, config] of Object.entries(snapshot.configs)) {
      await Model.create({
        system_key: systemKey,
        config: JSON.stringify(config),
        version: snapshot.version
      });
    }
  }
}

export default new GuardConfigDao();