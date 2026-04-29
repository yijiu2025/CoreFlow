// migrations/20260424000002-create-user-identity-table.js
// 示例迁移：创建用户身份认证表

export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('user_identities', {
    id: {
      type: Sequelize.DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    uid: {
      type: Sequelize.DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'uid' },
      onDelete: 'CASCADE',
      comment: '关联用户 ID'
    },
    identity_type: {
      type: Sequelize.DataTypes.ENUM('PASSWORD', 'WECHAT', 'GITHUB', 'GOOGLE'),
      allowNull: false,
      comment: '身份类型'
    },
    identifier: {
      type: Sequelize.DataTypes.STRING(100),
      allowNull: false,
      comment: '标识符 (用户名/openid/email)'
    },
    credential: {
      type: Sequelize.DataTypes.STRING(255),
      allowNull: true,
      comment: '凭证 (密码hash/token)'
    },
    created_at: {
      type: Sequelize.DataTypes.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DataTypes.DATE,
      allowNull: false
    }
  });

  await queryInterface.addIndex('user_identities', ['uid'], {
    name: 'idx_identity_uid'
  });
  await queryInterface.addIndex('user_identities', ['identity_type', 'identifier'], {
    name: 'idx_identity_type_identifier',
    unique: true
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('user_identities');
}
