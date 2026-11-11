/**
 * 迁移：注销申请记录「发起前的账号状态」
 *
 * 「待注销」现在是账号的一个**真实状态**（`status = -2`），发起的当下就把状态改掉：
 * 会话在下一次请求就会被 `isSessionUserActive` 拦下，而不是等注销执行（7 天后）才生效。
 *
 * 于是必须记住"改之前是什么"：撤销注销时要把账号恢复原样 —— 直接恢复成 1 会把
 * 一个原本被冻结（0）的账号顺手解冻了，那是另一个错误。
 *
 * 幂等：列已存在则跳过。
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
  if (cols.some(c => c.Field === 'prev_status')) return;

  await sql.query(
    "ALTER TABLE user_deactivation ADD COLUMN prev_status TINYINT NULL COMMENT '发起注销前的账号 status（撤销时据此恢复）' AFTER kick_updated_at"
  );
}

/**
 * 回滚：删列
 *
 * 回滚后无法区分"注销前是正常还是冻结"，撤销注销只能统一恢复成正常。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  const sql = queryInterface.sequelize;
  const [cols] = await sql.query('SHOW COLUMNS FROM user_deactivation');
  if (!cols.some(c => c.Field === 'prev_status')) return;
  await sql.query('ALTER TABLE user_deactivation DROP COLUMN prev_status');
}
