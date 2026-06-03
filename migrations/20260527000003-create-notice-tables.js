/**
 * 迁移：创建通知系统相关表
 * 包含：notice_email_codes, notice_configs
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

  // 1. notice_email_codes
  await createTableIfNotExists('notice_email_codes', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, comment: '主键' },
    email: { type: Sequelize.STRING(128), allowNull: false, comment: '接收邮箱' },
    code: { type: Sequelize.STRING(10), allowNull: false, comment: '验证码' },
    status: { type: Sequelize.TINYINT, defaultValue: 0, comment: '0:未使用, 1:已使用' },
    session_id: { type: Sequelize.STRING(64), allowNull: true, comment: '会话ID' },
    expired_at: { type: Sequelize.DATE, allowNull: false, comment: '过期时间' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('notice_email_codes', ['email', 'code', 'status'], { name: 'idx_email_code_status' });

  // 2. notice_configs
  await createTableIfNotExists('notice_configs', {
    key: { type: Sequelize.STRING(64), primaryKey: true, comment: '配置键' },
    value: { type: Sequelize.TEXT, allowNull: true },
    description: { type: Sequelize.STRING(255), allowNull: true },
    category: { type: Sequelize.STRING(32), allowNull: true, defaultValue: 'email' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('notice_configs');
  await queryInterface.dropTable('notice_email_codes');
}
