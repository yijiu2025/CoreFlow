/**
 * 创建 posecraft_recommendation 表（推荐记录）
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('posecraft_recommendation', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '推荐者 ID' },
    work_id: { type: Sequelize.BIGINT, allowNull: true, comment: '推荐的作品 ID' },
    template_id: { type: Sequelize.BIGINT, allowNull: true, comment: '推荐的模板 ID' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await queryInterface.addIndex('posecraft_recommendation', ['user_id', 'delete_version'], {
    name: 'idx_recommendation_user'
  });
  await queryInterface.addIndex('posecraft_recommendation', ['work_id', 'delete_version'], {
    name: 'idx_recommendation_work'
  });
  await queryInterface.addIndex('posecraft_recommendation', ['template_id', 'delete_version'], {
    name: 'idx_recommendation_template'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('posecraft_recommendation');
}
