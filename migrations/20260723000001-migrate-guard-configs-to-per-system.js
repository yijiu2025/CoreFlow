/**
 * 迁移：守卫配置表改为按系统拆分子行
 *
 * 旧结构：单行存储所有系统配置（id=1, configs=LONGTEXT, version=INT）
 * 新结构：每行一个系统（system_key=UNIQUE, config=LONGTEXT, version=INT）
 *
 * 优点：
 * 1. 写入一个 API 的变更只需更新一行，不再重写整个 45KB JSON
 * 2. 并发写入不同系统不再冲突
 * 3. 便于审计日志按系统追踪
 */

export async function up({ queryInterface, Sequelize }) {
  // 1. 读取旧数据
  const [rows] = await queryInterface.sequelize.query('SELECT id, configs, version, created_at, updated_at FROM guard_configs LIMIT 1');

  // 2. 重命名旧表（保留数据以便回滚）
  await queryInterface.sequelize.query('RENAME TABLE guard_configs TO guard_configs_v1');

  // 3. 创建新表
  await queryInterface.createTable('guard_configs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    system_key: { type: Sequelize.STRING(64), allowNull: false, comment: '系统标识（如 firewall, user）' },
    config: { type: Sequelize.TEXT('long'), allowNull: false, comment: '该系统完整配置树（JSON 字符串）' },
    version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '乐观锁版本号' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await queryInterface.addIndex('guard_configs', ['system_key'], { unique: true, name: 'uk_guard_configs_system_key' });
  await queryInterface.addIndex('guard_configs', ['version'], { name: 'idx_guard_configs_version' });

  // 4. 迁移数据：将旧单行 JSON 拆分为每系统一行
  if (rows.length > 0) {
    const oldRow = rows[0];
    let configs = {};
    try {
      configs = typeof oldRow.configs === 'string' ? JSON.parse(oldRow.configs) : oldRow.configs;
    } catch {
      // 解析失败则跳过迁移
    }

    const entries = Object.entries(configs);
    for (let i = 0; i < entries.length; i++) {
      const [systemKey, config] = entries[i];
      await queryInterface.insert(null, 'guard_configs', {
        system_key: systemKey,
        config: JSON.stringify(config),
        version: oldRow.version || 0,
        created_at: oldRow.created_at || new Date(),
        updated_at: oldRow.updated_at || new Date()
      });
    }

    // 5. 清理旧表
    await queryInterface.sequelize.query('DROP TABLE guard_configs_v1');
  } else {
    // 旧表无数据，直接清理
    await queryInterface.sequelize.query('DROP TABLE guard_configs_v1');
  }
}

export async function down({ queryInterface, Sequelize }) {
  // 回滚：读取新表数据，合并回单行
  const [rows] = await queryInterface.sequelize.query('SELECT system_key, config, version, created_at, updated_at FROM guard_configs');

  await queryInterface.sequelize.query('RENAME TABLE guard_configs TO guard_configs_v2');

  await queryInterface.createTable('guard_configs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    configs: { type: Sequelize.TEXT('long'), allowNull: false },
    version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  const configs = {};
  let maxVersion = 0;
  for (const row of rows) {
    let config = {};
    try {
      config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    } catch {
      // skip
    }
    configs[row.system_key] = config;
    maxVersion = Math.max(maxVersion, row.version);
  }

  await queryInterface.insert(null, 'guard_configs', {
    configs: JSON.stringify(configs),
    version: maxVersion,
    created_at: new Date(),
    updated_at: new Date()
  });

  await queryInterface.sequelize.query('DROP TABLE guard_configs_v2');
}