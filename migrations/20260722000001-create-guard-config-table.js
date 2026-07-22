/**
 * 迁移：创建守卫配置表 (guard_configs)
 * 替代 JSON 文件持久化，支持异步原子写入 + 乐观锁版本控制
 * 幂等设计：表已存在时跳过创建
 */

export async function up({ queryInterface, Sequelize }) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some((t) => Object.values(t)[0] === 'guard_configs');
  if (exists) return;

  await queryInterface.createTable('guard_configs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    configs: { type: Sequelize.JSON, allowNull: false, comment: '完整守卫配置树' },
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
