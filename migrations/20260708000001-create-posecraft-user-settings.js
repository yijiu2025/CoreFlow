/**
 * 创建 posecraft_user_settings 表
 * 与 user_user 1:1，存储前端个性设置（showTemplate、saveLoginInfo 等）
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('posecraft_user_settings', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '系统 User.id，唯一约束保证 1:1'
    },
    settings: {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'JSON 字符串，如 {"showTemplate":true}'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    }
  })

  await queryInterface.addIndex('posecraft_user_settings', ['user_id'], {
    unique: true,
    name: 'uk_settings_user'
  })
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('posecraft_user_settings')
}
