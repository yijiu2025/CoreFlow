/**
 * 迁移：创建会话管理相关表
 * 包含：session_user_session, session_tokens, session_logs
 * 幂等设计：表已存在时跳过
 */

export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  // 1. session_user_session
  await createTableIfNotExists('session_user_session', {
    user_id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: false, comment: '关联 User.id' },
    last_login_at: { type: Sequelize.DATE, comment: '最后登录时间' },
    last_login_ip: { type: Sequelize.STRING(50), comment: '最后登录IP' },
    last_login_app: { type: Sequelize.STRING(64), comment: '最后登录应用' },
    last_active_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), comment: '最后活跃时间' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  // 2. session_tokens
  await createTableIfNotExists('session_tokens', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '用户ID' },
    app_id: { type: Sequelize.STRING(64), allowNull: false, comment: '应用ID' },
    device_id: { type: Sequelize.STRING(100), comment: '设备标识' },
    token: { type: Sequelize.STRING(64), allowNull: false, comment: '凭证标识(jti/SHA-256)' },
    ip: { type: Sequelize.STRING(50) },
    location: { type: Sequelize.STRING(255) },
    user_agent: { type: Sequelize.TEXT },
    last_active: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('session_tokens', ['user_id']);
  await addIndexIfNotExists('session_tokens', ['app_id']);
  await addIndexIfNotExists('session_tokens', ['device_id']);
  await addIndexIfNotExists('session_tokens', ['token'], { name: 'idx_session_token_identifier' });
  await addIndexIfNotExists('session_tokens', ['user_id', 'app_id', 'device_id'], { name: 'idx_user_app_device' });

  // 3. session_logs
  await createTableIfNotExists('session_logs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, comment: '自增主键' },
    created_at: { type: Sequelize.DATE, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), comment: '创建时间' },
    user_id: { type: Sequelize.BIGINT, allowNull: true, comment: '用户ID' },
    event: { type: Sequelize.STRING(50), allowNull: false, comment: '事件类型: LOGIN, LOGOUT, KICK' },
    app_id: { type: Sequelize.STRING(64), comment: '应用ID' },
    ip: { type: Sequelize.STRING(50) },
    location: { type: Sequelize.STRING(100) },
    user_agent: { type: Sequelize.TEXT },
    details: { type: Sequelize.JSON, comment: '详情JSON' },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('session_logs', ['user_id', 'event', 'created_at'], { name: 'idx_session_log_audit' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('session_logs');
  await queryInterface.dropTable('session_tokens');
  await queryInterface.dropTable('session_user_session');
}
