/**
 * 迁移：创建用户基础信息表
 * 对应模型：src/models/user/User.js
 * 表名：user_user
 * 幂等设计：表已存在时跳过
 */

export async function up({ queryInterface, Sequelize }) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some((t) => Object.values(t)[0] === 'user_user');
  if (exists) return;

  await queryInterface.createTable('user_user', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      comment: '内部系统主键'
    },
    uid: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      unique: true,
      allowNull: false,
      comment: '对外全局唯一标识'
    },
    username: {
      type: Sequelize.STRING(50),
      allowNull: false,
      comment: '用户显示昵称'
    },
    email: {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '联系邮箱'
    },
    phone: {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: '联系手机号'
    },
    avatar: {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '头像链接'
    },
    status: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
      comment: '1:正常, 0:封禁, -1:已注销'
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

  await queryInterface.addIndex('user_user', ['uid'], { name: 'idx_uid' });
  await queryInterface.addIndex('user_user', ['email', 'delete_version'], { unique: true, name: 'uk_email_delete_version' });
  await queryInterface.addIndex('user_user', ['phone', 'delete_version'], { unique: true, name: 'uk_phone_delete_version' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('user_user');
}
