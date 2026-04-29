// migrations/20260424000001-create-users-table.js
// 示例迁移：创建用户基础信息表
// 说明：每个迁移必须导出 up (前进) 和 down (回滚) 两个函数

/**
 * 前进：创建 users 表
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('users', {
    uid: {
      type: Sequelize.DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '用户唯一标识'
    },
    username: {
      type: Sequelize.DataTypes.STRING(50),
      unique: true,
      allowNull: false,
      comment: '用户名'
    },
    nickname: {
      type: Sequelize.DataTypes.STRING(50),
      allowNull: true,
      comment: '昵称'
    },
    email: {
      type: Sequelize.DataTypes.STRING(100),
      unique: true,
      allowNull: true,
      comment: '邮箱'
    },
    phone: {
      type: Sequelize.DataTypes.STRING(20),
      unique: true,
      allowNull: true,
      comment: '手机号'
    },
    avatar: {
      type: Sequelize.DataTypes.STRING(255),
      allowNull: true,
      comment: '头像链接'
    },
    status: {
      type: Sequelize.DataTypes.TINYINT,
      defaultValue: 1,
      comment: '1:可用, 0:禁用'
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

  // 创建索引
  await queryInterface.addIndex('users', ['email'], {
    name: 'idx_users_email'
  });
  await queryInterface.addIndex('users', ['status'], {
    name: 'idx_users_status'
  });
}

/**
 * 回滚：删除 users 表
 */
export async function down({ queryInterface }) {
  await queryInterface.dropTable('users');
}
