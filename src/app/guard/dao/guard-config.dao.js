/**
 * 守卫配置数据访问层
 * 按系统拆分子行存储，每行一个系统配置
 * 启动时加载所有行合并为内存对象，写入时按系统独立 upsert
 * 仅同步有变更的系统，每行独立版本号
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import { getModel } from '../../../framework/db/index.js';

class GuardConfigDao {
  /** 上次从 DB 加载的序列化配置快照，用于检测变更 */
  _snapshot = {};

  /**
   * 从数据库加载所有系统的配置
   * 读取所有行，按 system_key 合并为对象，返回每行独立版本号
   *
   * @returns {Promise<{configs: object, version: number, versions: object<string, number>}>}
   */
  async loadFromDB() {
    const Model = getModel('GuardConfig');
    const rows = await Model.findAll();

    const configs = {};
    const versions = {};
    let maxVersion = 0;

    // 重置快照
    this._snapshot = {};

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
      // 保存原始序列化字符串用于后续比较（排除 updatedAt 干扰）
      this._snapshot[row.system_key] = this._serializeForCompare(config);
    }

    return { configs, version: maxVersion, versions };
  }

  /**
   * 序列化配置用于比较（排除 updatedAt，避免时间戳差异导致误判）
   */
  _serializeForCompare(config) {
    const copy = { ...config };
    delete copy.updatedAt;
    // 递归删除 groups 和 apis 中的 updatedAt
    if (copy.groups && typeof copy.groups === 'object') {
      for (const g of Object.values(copy.groups)) {
        if (g && typeof g === 'object') {
          delete g.updatedAt;
          if (g.apis && typeof g.apis === 'object') {
            for (const a of Object.values(g.apis)) {
              if (a && typeof a === 'object') delete a.updatedAt;
            }
          }
        }
      }
    }
    return JSON.stringify(copy);
  }

  /**
   * 增量写入配置到数据库
   * 对比内存和 DB 的序列化内容，仅更新有变更的系统
   * 每行独立版本号，无变更的行版本号不变
   *
   * @param {object} configs - 完整配置树（{ systemKey: config, ... }）
   * @param {object<string, number>} dbVersions - 当前 DB 中每行的版本号
   * @returns {Promise<{maxVersion: number, updated: string[], versions: object<string, number>}>}
   */
  async saveToDB(configs, dbVersions) {
    const Model = getModel('GuardConfig');
    let maxVersion = Math.max(0, ...Object.values(dbVersions));
    const updated = [];
    const versions = {};

    for (const [systemKey, config] of Object.entries(configs)) {
      const serialized = JSON.stringify(config);
      const dbVersion = dbVersions[systemKey] || 0;
      const newVersion = dbVersion + 1;
      const compareKey = this._serializeForCompare(config);
      const isChanged = compareKey !== this._snapshot[systemKey];

      const [row] = await Model.findOrCreate({
        where: { system_key: systemKey },
        defaults: {
          system_key: systemKey,
          config: serialized,
          version: newVersion
        }
      });

      if (row) {
        // 新创建的行（row 是创建的实例，version 是 newVersion）
        // 或已有行但数据变更时，更新
        if (isChanged) {
          await Model.update({ config: serialized, version: newVersion }, { where: { system_key: systemKey } });
          updated.push(systemKey);
          versions[systemKey] = newVersion;
          // 🔴 写完必须同步快照（2026-11-08 修复）：`_snapshot` 是"上次已落库的值"，
          // 不刷新会让它永远滞后一代。典型症状：把开关改走再改回原值（A→B→A）时，
          // 第二次 `isChanged` 拿 A 和**旧快照 A** 比 → 判为未变更 → **A 不落库**，
          // DB 里留着 B；重启或别的实例同步后又变回 B，运维看到"我改回来了它自己又变回去"。
          this._snapshot[systemKey] = compareKey;
        } else {
          // 无变更，保持原版本号
          versions[systemKey] = dbVersion;
          // 保持不变量：快照 == DB 当前值（此处两者本就相等，赋值是幂等的防御）
          this._snapshot[systemKey] = compareKey;
        }
      } else {
        // 新创建的行
        updated.push(systemKey);
        versions[systemKey] = newVersion;
      }

      maxVersion = Math.max(maxVersion, versions[systemKey]);
    }

    return { maxVersion, updated, versions };
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
    const Model = getModel('GuardConfig');

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

const guardConfigDao = new GuardConfigDao();

export default guardConfigDao;
