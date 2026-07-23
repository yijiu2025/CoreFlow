/* eslint-disable no-console */

/**
 * 迁移：创建守卫配置表 (guard_configs)
 * 替代 JSON 文件持久化，支持异步原子写入 + 乐观锁版本控制
 * 幂等设计：表已存在时跳过创建
 *
 * 注意：configs 列使用 longtext 而非 JSON 类型，因为部分 MySQL 版本
 * 对 JSON 类型的支持不完整，且 Sequelize 的 DataTypes.JSON 在某些
 * 环境中会被降级为 longtext。DAO 层在 loadFromDB 中手动 JSON.parse。
 */

export async function up({ queryInterface, Sequelize }) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some(t => Object.values(t)[0] === 'guard_configs');
  if (exists) return;

  await queryInterface.createTable('guard_configs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    configs: {
      type: Sequelize.TEXT('long'),
      allowNull: false,
      comment: '完整守卫配置树（JSON 字符串，DAO 层手动解析）'
    },
    version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '乐观锁版本号' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await queryInterface.addIndex('guard_configs', ['version'], { name: 'idx_guard_configs_version' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('guard_configs');
}
