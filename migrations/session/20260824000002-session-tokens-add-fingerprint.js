/**
 * 迁移：session_tokens 表新增 device_fingerprint 字段
 *
 * device_fingerprint：device_id + UA + uid 等算出的复合指纹，每次登录计算并记录，
 * 用于访问时比对——同设备同账号的 fingerprint 应稳定，突变则可能账号被盗/换设备。
 *
 * 幂等：字段已存在时跳过
 */
export async function up({ queryInterface, Sequelize }) {
  // 查现有列，幂等跳过
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'device_fingerprint'");
  if (rows.length === 0) {
    await queryInterface.addColumn('session_tokens', 'device_fingerprint', {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: '复合设备指纹（device_id + UA + uid 等计算，访问时比对检测风险）',
      after: 'device_id'
    });
  }
  // 加索引：按指纹查询（访问校验时用）
  try {
    await queryInterface.addIndex('session_tokens', ['device_fingerprint'], {
      name: 'idx_device_fingerprint'
    });
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

export async function down({ queryInterface }) {
  try {
    await queryInterface.removeIndex('session_tokens', 'idx_device_fingerprint');
  } catch (e) {
    /* 忽略索引不存在 */
  }
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'device_fingerprint'");
  if (rows.length > 0) {
    await queryInterface.removeColumn('session_tokens', 'device_fingerprint');
  }
}
