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
 *
 * 数据安全（2026-10-29 加固）：
 * - JSON 解析失败必须中止迁移，绝不在数据未成功迁移前删除源表。
 * - 迁移过程中断（RENAME 后、INSERT 中断）保留 `guard_configs_v1` 备份，
 *   重跑可续传，仅在全部数据落库成功后才清理备份。
 */

async function listTables(queryInterface) {
  const [rows] = await queryInterface.sequelize.query('SHOW TABLES');
  return (rows || []).map(r => r.table || r.Tables_in_db || r[Object.keys(r)[0]]);
}

export async function up({ queryInterface, Sequelize }) {
  const tables = await listTables(queryInterface);
  const hasBackup = tables.includes('guard_configs_v1');

  let rows;
  if (hasBackup) {
    // 上次执行已 RENAME 并中断：直接从备份读取旧数据，新表已存在
    const [backupRows] = await queryInterface.sequelize.query(
      'SELECT id, configs, version, created_at, updated_at FROM guard_configs_v1 LIMIT 1'
    );
    rows = backupRows || [];
  } else {
    const [oldRows] = await queryInterface.sequelize.query(
      'SELECT id, configs, version, created_at, updated_at FROM guard_configs LIMIT 1'
    );
    rows = oldRows || [];

    // 先解析旧配置：任何解析失败都必须中止，绝不能在未成功迁移前删除源表
    if (rows.length > 0) {
      const oldRow = rows[0];
      let configs;
      try {
        configs = typeof oldRow.configs === 'string' ? JSON.parse(oldRow.configs) : oldRow.configs;
      } catch (err) {
        throw new Error(
          `guard 配置迁移中止：旧配置 JSON 解析失败，源表未删除（${err.message}）`,
          { cause: err }
        );
      }
      if (!configs || typeof configs !== 'object') {
        throw new Error('guard 配置迁移中止：旧配置不是有效对象，源表未删除');
      }
    }

    // 重命名旧表（保留数据以便回滚/续传）
    await queryInterface.sequelize.query('RENAME TABLE guard_configs TO guard_configs_v1');

    // 创建新表
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
  }

  // 迁移数据：将旧单行 JSON 拆分为每系统一行（已存在的 key 跳过，保证续传幂等）
  if (rows.length > 0) {
    const oldRow = rows[0];
    const configs =
      typeof oldRow.configs === 'string' ? JSON.parse(oldRow.configs) : oldRow.configs || {};

    const [existingRows] = await queryInterface.sequelize.query('SELECT system_key FROM guard_configs');
    const existingKeys = new Set((existingRows || []).map(r => r.system_key));

    for (const [systemKey, config] of Object.entries(configs)) {
      if (existingKeys.has(systemKey)) continue;
      await queryInterface.insert(null, 'guard_configs', {
        system_key: systemKey,
        config: JSON.stringify(config),
        version: oldRow.version || 0,
        created_at: oldRow.created_at || new Date(),
        updated_at: oldRow.updated_at || new Date()
      });
    }
  }

  // 全部数据落库成功后才清理备份
  if (hasBackup) {
    await queryInterface.sequelize.query('DROP TABLE guard_configs_v1');
  }
}

export async function down({ queryInterface, Sequelize }) {
  // 回滚：读取新表数据，合并回单行
  const [rows] = await queryInterface.sequelize.query(
    'SELECT system_key, config, version, created_at, updated_at FROM guard_configs'
  );

  // 先解析并校验全部配置，任何解析失败都中止，避免回滚丢数据
  const configs = {};
  let maxVersion = 0;
  for (const row of rows) {
    let config;
    try {
      config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    } catch (err) {
      throw new Error(
        `guard 配置回滚中止：系统 ${row.system_key} 配置 JSON 解析失败（${err.message}）`,
        { cause: err }
      );
    }
    configs[row.system_key] = config;
    maxVersion = Math.max(maxVersion, row.version);
  }

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

  await queryInterface.insert(null, 'guard_configs', {
    configs: JSON.stringify(configs),
    version: maxVersion,
    created_at: new Date(),
    updated_at: new Date()
  });

  await queryInterface.sequelize.query('DROP TABLE guard_configs_v2');
}
