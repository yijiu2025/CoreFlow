/**
 * 迁移：audit_logs 表新增 device_id 字段
 *
 * 为什么单独成列而不是塞进 details JSON：
 * - 设备码是**稳定身份维度**，排查"同一台机器上还做过什么"要能按它过滤/分组，
 *   塞 JSON 里只能全表扫 + JSON_EXTRACT（用不上索引）；
 * - 操作日志列表/导出都要显示它，属于高频读取列；
 * - 历史行保持 NULL（当时没有采集，不可考），不回填。
 *
 * 索引取 (device_id, created_at)：所有按设备查的场景都带时间排序，与
 * audit_logs 既有的 (event, created_at) / (user_id, created_at) 同构。
 *
 * 幂等：字段已存在时跳过
 */
export async function up({ queryInterface, Sequelize }) {
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM audit_logs LIKE 'device_id'");
  if (rows.length === 0) {
    await queryInterface.addColumn('audit_logs', 'device_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '客户端设备标识（操作时携带的 device_id，非凭证）',
      after: 'user_agent'
    });
    await queryInterface.addIndex('audit_logs', ['device_id', 'created_at'], {
      name: 'audit_logs_device_created'
    });
  }
}

export async function down({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM audit_logs LIKE 'device_id'");
  if (rows.length > 0) {
    await queryInterface.removeIndex('audit_logs', 'audit_logs_device_created');
    await queryInterface.removeColumn('audit_logs', 'device_id');
  }
}
