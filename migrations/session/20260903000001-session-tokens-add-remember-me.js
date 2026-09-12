/**
 * 迁移：session_tokens 表新增 remember_me 字段
 *
 * remember_me：登录时是否勾选"记住我"，区分短/长期会话。
 * true=30d 长期会话（Redis 驱逐后可由 sid_r 恢复），false=30min 短期会话。
 * getSession 降级重建时用此真值做 TTL 判定，替代之前用 createdAt+TTL 推算的方式。
 *
 * 幂等：字段已存在时跳过
 */
export async function up({ queryInterface, Sequelize }) {
  // 查现有列，幂等跳过
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'remember_me'");
  if (rows.length === 0) {
    await queryInterface.addColumn('session_tokens', 'remember_me', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: '是否记住我（长期登录）：true=30d 长期会话，false=30min 短期会话',
      after: 'revoked'
    });
  }
}

export async function down({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query("SHOW COLUMNS FROM session_tokens LIKE 'remember_me'");
  if (rows.length > 0) {
    await queryInterface.removeColumn('session_tokens', 'remember_me');
  }
}
