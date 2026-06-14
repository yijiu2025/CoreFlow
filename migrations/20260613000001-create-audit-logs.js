/**
 * 迁移：创建安全审计日志表
 * 记录关键安全事件：登录/登出/权限变更/密码修改/踢出设备
 */

export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('audit_logs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: true, comment: '关联用户 ID' },
    event: { type: Sequelize.STRING(50), allowNull: false, comment: '事件类型' },
    app_id: { type: Sequelize.STRING(64), allowNull: true, comment: '应用标识' },
    ip: { type: Sequelize.STRING(50), comment: '客户端 IP' },
    user_agent: { type: Sequelize.TEXT, comment: 'User-Agent' },
    details: { type: Sequelize.JSON, allowNull: true, comment: '事件详情' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  });

  await queryInterface.addIndex('audit_logs', ['user_id']);
  await queryInterface.addIndex('audit_logs', ['event']);
  await queryInterface.addIndex('audit_logs', ['created_at']);
  await queryInterface.addIndex('audit_logs', ['ip']);
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('audit_logs');
}
