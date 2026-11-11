/**
 * 迁移：注销的「会话未踢干净」标记
 *
 * 为什么要这张表的列：注销执行时，DB 里的 `session_tokens` 一定会被 revoke，但
 * **Redis 里的活跃会话要靠一次网络调用删掉**。Redis 不可用时那一步只能记日志 ——
 * 于是出现"账号已注销、会话还在 Redis 里活着"的状态：
 *
 * - `scope=all`：用户 status 变 -1，残留会话在下一个请求会被 `isSessionUserActive`
 *   拦下，危害有限（但仍应清掉，否则逆索引会一直留垃圾）；
 * - `scope=app`：用户本身还是正常的，**残留会话在那个应用里仍然有效**，直到 TTL 到期。
 *   这是真正的安全缺口，必须在下一次登录时补踢。
 *
 * 所以失败必须**落库**而不是只写日志（日志没人会回头翻），字段含义：
 * - `kick_pending`：1 = 还有会话没踢掉，登录时需要重试；
 * - `kick_attempts`：重试次数（反复失败说明 Redis 长时间不可用，值得告警）；
 * - `kick_last_error`：最后一次失败原因（截断，排障用）；
 * - `kick_updated_at`：最后一次尝试时间。
 *
 * 幂等：列/索引已存在则跳过。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  const sql = queryInterface.sequelize;
  const [cols] = await sql.query('SHOW COLUMNS FROM user_deactivation');
  const names = new Set(cols.map(c => c.Field));

  if (!names.has('kick_pending')) {
    await sql.query(
      "ALTER TABLE user_deactivation ADD COLUMN kick_pending TINYINT NOT NULL DEFAULT 0 COMMENT '1=还有 Redis 会话没踢掉，登录时重试' AFTER status"
    );
  }
  if (!names.has('kick_attempts')) {
    await sql.query(
      "ALTER TABLE user_deactivation ADD COLUMN kick_attempts INT NOT NULL DEFAULT 0 COMMENT '重试踢会话次数' AFTER kick_pending"
    );
  }
  if (!names.has('kick_last_error')) {
    await sql.query(
      "ALTER TABLE user_deactivation ADD COLUMN kick_last_error VARCHAR(255) NULL COMMENT '最后一次踢失败的原因（截断）' AFTER kick_attempts"
    );
  }
  if (!names.has('kick_updated_at')) {
    await sql.query(
      "ALTER TABLE user_deactivation ADD COLUMN kick_updated_at DATETIME NULL COMMENT '最后一次尝试踢会话的时间' AFTER kick_last_error"
    );
  }

  const [indexes] = await sql.query('SHOW INDEX FROM user_deactivation');
  const indexNames = new Set(indexes.map(i => i.Key_name));
  if (!indexNames.has('idx_deactivation_kick')) {
    // 登录时按 (user_id, kick_pending=1) 查，一次索引命中，行数通常为 0
    await sql.query('ALTER TABLE user_deactivation ADD INDEX idx_deactivation_kick (user_id, kick_pending)');
  }
}

/**
 * 回滚：删列与索引
 *
 * 回滚会丢掉"未清理干净"的线索 —— 之后只能靠人去翻日志或自己比对 Redis 逆索引。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const sql = queryInterface.sequelize;
  const [indexes] = await sql.query('SHOW INDEX FROM user_deactivation');
  if (indexes.some(i => i.Key_name === 'idx_deactivation_kick')) {
    await sql.query('ALTER TABLE user_deactivation DROP INDEX idx_deactivation_kick');
  }

  const [cols] = await sql.query('SHOW COLUMNS FROM user_deactivation');
  const names = new Set(cols.map(c => c.Field));
  for (const col of ['kick_updated_at', 'kick_last_error', 'kick_attempts', 'kick_pending']) {
    if (names.has(col)) {
      await sql.query(`ALTER TABLE user_deactivation DROP COLUMN ${col}`);
    }
  }
}
