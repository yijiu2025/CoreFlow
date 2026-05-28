/**
 * 迁移：创建通知系统相关表
 * 包含：notice_email_codes, notice_configs
 */

export async function up({ queryInterface, Sequelize }) {
  // 1. notice_email_codes - 邮件验证码表
  await queryInterface.createTable('notice_email_codes', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      comment: '主键自增 ID'
    },
    email: {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: '接收验证码的邮箱'
    },
    code: {
      type: Sequelize.STRING(10),
      allowNull: false,
      comment: '验证码'
    },
    status: {
      type: Sequelize.TINYINT,
      defaultValue: 0,
      comment: '验证码状态 (0:未使用, 1:已使用)'
    },
    session_id: {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: '发起请求的会话 ID'
    },
    expired_at: {
      type: Sequelize.DATE,
      allowNull: false,
      comment: '验证码过期截止时间'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });

  await queryInterface.addIndex(
    'notice_email_codes',
    ['email', 'code', 'status'],
    {
      name: 'idx_email_code_status'
    }
  );

  // 2. notice_configs - 通知配置表
  await queryInterface.createTable('notice_configs', {
    key: {
      type: Sequelize.STRING(64),
      primaryKey: true,
      comment: '配置项唯一标识键'
    },
    value: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    description: {
      type: Sequelize.STRING(255),
      allowNull: true
    },
    category: {
      type: Sequelize.STRING(32),
      allowNull: true,
      defaultValue: 'email',
      comment: '配置分类 (email, dingtalk, wechat)'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('notice_configs');
  await queryInterface.dropTable('notice_email_codes');
}
