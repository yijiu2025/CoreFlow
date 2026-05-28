/**
 * 迁移：创建会话管理相关表
 * 包含：session_user_session, session_tokens, session_logs
 */

export async function up({ queryInterface, Sequelize }) {
  // 1. session_user_session - 用户全局会话主表
  await queryInterface.createTable('session_user_session', {
    user_id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: false,
      comment: '关联 User.id'
    },
    last_login_at: {
      type: Sequelize.DATE,
      comment: '最后登录时间'
    },
    last_login_ip: {
      type: Sequelize.STRING(50),
      comment: '最后登录IP'
    },
    last_login_app: {
      type: Sequelize.STRING(64),
      comment: '最后登录的应用ID'
    },
    last_active_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: '最后活跃时间 (在线状态心跳指标)'
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

  // 2. session_tokens - 会话令牌表
  await queryInterface.createTable('session_tokens', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '用户内部ID'
    },
    app_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: '所属应用ID'
    },
    device_id: {
      type: Sequelize.STRING(100),
      comment: '设备唯一标识 (用于多端互踢)'
    },
    token: {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: '凭证唯一标识符 (jti 或 SHA-256 签名值)'
    },
    ip: {
      type: Sequelize.STRING(50)
    },
    location: {
      type: Sequelize.STRING(255)
    },
    user_agent: {
      type: Sequelize.TEXT
    },
    last_active: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

  await queryInterface.addIndex('session_tokens', ['user_id']);
  await queryInterface.addIndex('session_tokens', ['app_id']);
  await queryInterface.addIndex('session_tokens', ['device_id']);
  await queryInterface.addIndex('session_tokens', ['token'], {
    name: 'idx_session_token_identifier'
  });
  await queryInterface.addIndex(
    'session_tokens',
    ['user_id', 'app_id', 'device_id'],
    {
      name: 'idx_user_app_device'
    }
  );

  // 3. session_logs - 会话审计日志表
  await queryInterface.createTable('session_logs', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      comment: '自增主键'
    },
    created_at: {
      type: Sequelize.DATE,
      primaryKey: true,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: '创建时间 (物理分区依据字段)'
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '用户内部ID (若登录失败可能无UID)'
    },
    event: {
      type: Sequelize.STRING(50),
      allowNull: false,
      comment: '事件类型: LOGIN, LOGOUT, KICK, FORBIDDEN'
    },
    app_id: {
      type: Sequelize.STRING(64),
      comment: '关联应用ID'
    },
    ip: {
      type: Sequelize.STRING(50)
    },
    location: {
      type: Sequelize.STRING(100)
    },
    user_agent: {
      type: Sequelize.TEXT
    },
    details: {
      type: Sequelize.JSON,
      comment: '详情 JSON (例如失败原因)'
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
    'session_logs',
    ['user_id', 'event', 'created_at'],
    {
      name: 'idx_session_log_audit'
    }
  );
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('session_logs');
  await queryInterface.dropTable('session_tokens');
  await queryInterface.dropTable('session_user_session');
}
