/**
 * 守卫配置数据访问层
 * 按系统拆分子行存储，每行一个系统配置
 * 启动时加载所有行合并为内存对象，写入时按系统独立 upsert
 * 仅同步有变更的系统，每行独立版本号
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import sequelize from '../../../db/index.js';

class GuardConfigDao {
  /**
   * 从数据库加载所有系统的配置
   * 读取所有行，按 system_key 合并为对象，返回每行独立版本号
   *
   * @returns {Promise<{configs: object, version: number, versions: object<string, number>}>}
   */
  async loadFromDB() {
    const Model = sequelize.models.GuardConfig;
    const rows = await Model.findAll();

    const configs = {};
    const versions = {};
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
      versions[row.system_key] = row.version || 0;
      maxVersion = Math.max(maxVersion, row.version || 0);
    }

    return { configs, version: maxVersion, versions };
  }

  /**
   * 增量写入配置到数据库
   * 对比内存和 DB 的版本号，仅 upsert 有变更的系统
   * 每行独立版本号，无变更的行不受影响
   *
   * @param {object} configs - 完整配置树（{ systemKey: config, ... }）
   * @param {object<string, number>} dbVersions - 当前 DB 中每行的版本号
   * @returns {Promise<number>} 新的最大版本号
   */
  async saveToDB(configs, dbVersions) {
    const Model = sequelize.models.GuardConfig;
    let maxVersion = Math.max(0, ...Object.values(dbVersions));

    for (const [systemKey, config] of Object.entries(configs)) {
      const serialized = JSON.stringify(config);
      const dbVersion = dbVersions[systemKey] || 0;
      const newVersion = dbVersion + 1;

      const [row] = await Model.findOrCreate({
        where: { system_key: systemKey },
        defaults: {
          system_key: systemKey,
          config: serialized,
          version: newVersion
        }
      });

      if (row) {
        // 只在版本号不同时更新（即数据有变更）
        if (row.version !== newVersion) {
          await Model.update({ config: serialized, version: newVersion }, { where: { system_key: systemKey } });
        }
      }

      maxVersion = Math.max(maxVersion, newVersion);
    }

    return maxVersion;
  }

  /**
   * 备份当前数据库状态（用于回滚）
   *
   * @returns {Promise<{configs: object, version: number, versions: object<string, number>}>}
   */
  async backup() {
    return this.loadFromDB();
  }

  /**
   * 从快照恢复数据库状态（回滚）
   *
   * @param {{configs: object, versions: object<string, number>}} snapshot - 备份快照
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
        version: snapshot.versions[systemKey] || 0
      });
    }
  }
}

export default new GuardConfigDao();
