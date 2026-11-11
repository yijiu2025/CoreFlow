/**
 * 迁移：账号高危操作支撑 —— 注销发起人 + 临时密码表
 *
 * 两件事：
 * 1. `user_deactivation` 补 `requested_by` / `requested_by_name`
 *    注销原来只有「撤销人」（`revoked_by`），管理员从后台发起删除时**没有地方记谁发起的**
 *    —— 而这是本仓最高危的写操作，审计里必须能回答"这条删除是谁点的"。
 *    名字用快照列而不是 JOIN：发起人账号后来被删了，历史仍要读得懂。
 *
 * 2. 新建 `user_temp_password`
 *    管理员给人开"临时密码"用于代登录排障。它必须是**独立表**而不是往 user_identity
 *    里插一条 password：identity 的 (identity_type, identifier, delete_version) 唯一索引
 *    会让临时密码与真实密码抢同一个 identifier，且 `verifyPassword` 会认成永久密码。
 *
 * 幂等：列/表/索引已存在则跳过，可重复执行。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @param {object} ctx.Sequelize Sequelize 构造器
 * @returns {Promise<void>}
 */
export async function up({ queryInterface, Sequelize }) {
  const sql = queryInterface.sequelize;

  // ── 1. user_deactivation 补发起人 ─────────────────────────────
  const [deactCols] = await sql.query('SHOW COLUMNS FROM user_deactivation');
  const deactNames = new Set(deactCols.map(c => c.Field));
  if (!deactNames.has('requested_by')) {
    await sql.query(
      "ALTER TABLE user_deactivation ADD COLUMN requested_by BIGINT NULL COMMENT '发起人 user_id（管理员发起时填，用户自助时为空）' AFTER uid"
    );
  }
  if (!deactNames.has('requested_by_name')) {
    await sql.query(
      "ALTER TABLE user_deactivation ADD COLUMN requested_by_name VARCHAR(64) NULL COMMENT '发起人账号快照（账号被删后历史仍可读）' AFTER requested_by"
    );
  }

  // ── 2. 临时密码表 ─────────────────────────────────────────────
  const table = 'user_temp_password';
  const [tables] = await sql.query('SHOW TABLES');
  const exists = tables.some(t => Object.values(t)[0] === table);
  if (exists) return;

  await queryInterface.createTable(
    table,
    {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '目标用户 user_user.id' },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: '临时密码的 bcrypt 哈希（明文只在生成响应里出现一次）'
      },
      expires_at: { type: Sequelize.DATE, allowNull: false, comment: '失效时间' },
      max_uses: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1, comment: '可用次数（默认 1）' },
      used_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '已用次数' },
      last_used_at: { type: Sequelize.DATE, allowNull: true, comment: '最近一次使用时间' },
      revoked_at: { type: Sequelize.DATE, allowNull: true, comment: '手动作废时间（非空即不可再用）' },
      created_by: { type: Sequelize.BIGINT, allowNull: true, comment: '签发人 user_id' },
      created_by_name: { type: Sequelize.STRING(64), allowNull: true, comment: '签发人账号快照' },
      reason: { type: Sequelize.STRING(255), allowNull: true, comment: '签发原因（审计用）' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: true }
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' }
  );

  const [indexes] = await sql.query(`SHOW INDEX FROM ${table}`);
  const indexNames = new Set(indexes.map(i => i.Key_name));
  if (!indexNames.has('idx_temp_pwd_user')) {
    await sql.query(`ALTER TABLE ${table} ADD INDEX idx_temp_pwd_user (user_id, expires_at)`);
  }
}

/**
 * 回滚：删表 + 删两列
 *
 * 回滚会丢临时密码与注销发起人信息 —— 前者本就是短时凭据，后者在审计日志里仍有副本。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const sql = queryInterface.sequelize;
  await sql.query('DROP TABLE IF EXISTS user_temp_password');

  const [deactCols] = await sql.query('SHOW COLUMNS FROM user_deactivation');
  const deactNames = new Set(deactCols.map(c => c.Field));
  if (deactNames.has('requested_by_name')) {
    await sql.query('ALTER TABLE user_deactivation DROP COLUMN requested_by_name');
  }
  if (deactNames.has('requested_by')) {
    await sql.query('ALTER TABLE user_deactivation DROP COLUMN requested_by');
  }
}
