/**
 * 迁移：session_tokens 表新增 device_id_original 字段
 *
 * device_id_original：该设备链首次登录时的原始设备 ID，写入后永不更新。
 *
 * 背景：device_id 会在用户清 localStorage 生新 ID 且通过人机验证后被
 * updateSessionBaseline 更新为最新值（同一 token 链内滚动）。保留原始 ID 用于：
 * 1. 审计：追溯设备身份漂移（该浏览器链最早的身份是什么）
 * 2. 恢复兜底：device_id 为空/异常时，仍可恢复到链上最早已知身份
 *
 * 存量行回填：device_id_original = device_id（迁移时刻的当前值即为该行已知最早的链身份）。
 *
 * 幂等：字段已存在时跳过
 */
export async function up({ queryInterface, Sequelize }) {
  // 查现有列，幂等跳过
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'device_id_original'");
  if (rows.length === 0) {
    await queryInterface.addColumn('session_tokens', 'device_id_original', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: '设备链首次登录的原始设备 ID（写入后永不更新，审计/恢复兜底用）',
      after: 'device_id'
    });
    // 存量行回填：当前 device_id 即该链已知最早身份
    await queryInterface.sequelize.query(
      'UPDATE session_tokens SET device_id_original = device_id WHERE device_id_original IS NULL AND device_id IS NOT NULL'
    );
  }
}

export async function down({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'device_id_original'");
  if (rows.length > 0) {
    await queryInterface.removeColumn('session_tokens', 'device_id_original');
  }
}
