/**
 * 创建 PoseCraft 作品分享记录表
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('posecraft_user_share', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '分享者用户ID'
    },
    work_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '分享的作品ID'
    },
    target_user_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '分享目标用户ID（null=公开分享）'
    },
    delete_version: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    }
  });

  await queryInterface.addIndex('posecraft_user_share', {
    fields: ['user_id', 'work_id', 'target_user_id', 'delete_version'],
    unique: true,
    name: 'uk_user_share'
  });
  await queryInterface.addIndex('posecraft_user_share', ['work_id'], { name: 'idx_share_work' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('posecraft_user_share');
}