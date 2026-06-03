/**
 * 迁移：创建用户身份认证表
 * 对应模型：src/models/user/UserIdentity.js
 * 表名：user_identity
 * 幂等设计：表已存在时跳过
 */

export async function up({ queryInterface, Sequelize }) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some((t) => Object.values(t)[0] === 'user_identity');
  if (exists) return;

  await queryInterface.createTable('user_identity', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '关联 user_user.id'
    },
    identity_type: {
      type: Sequelize.STRING(32),
      allowNull: false,
      comment: '认证类型: password, wechat, github, phone_sms'
    },
    identifier: {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: '认证标识: 登录名/邮箱/手机号/OpenID'
    },
    credential: {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '安全凭证: 密码hash/三方Token'
    },
    failed_attempts: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: '连续鉴权失败次数'
    },
    locked_until: {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '账号锁定截止时间'
    },
    last_login_at: {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '最后成功登录时间'
    },
    delete_version: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: '软删除版本标志'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    },
    deleted_at: {
      type: Sequelize.DATE,
      allowNull: true
    }
  });

  await queryInterface.addIndex('user_identity', ['identity_type', 'identifier', 'delete_version'], {
    unique: true,
    name: 'uk_identity_type_identifier'
  });
  await queryInterface.addIndex('user_identity', ['user_id'], { name: 'idx_user_id' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('user_identity');
}
