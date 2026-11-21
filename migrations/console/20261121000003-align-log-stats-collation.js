/**
 * 迁移：把日志归档表的字符串列排序规则对齐到与源表一致
 *
 * === 要修的是什么 ===
 * 归档表由 `log.dao.js` 的 purge 流程**建表时没继承源表排序规则**：
 *
 *   session_logs.ip            varchar(50) utf8mb4_general_ci   ← 源
 *   log_stats_login_pairs.ip   varchar(64) utf8mb4_unicode_ci   ← 归档（不一致）
 *   log_stats_ips.ip           varchar(64) utf8mb4_unicode_ci   ← 同上
 *
 * 于是 `明细 UNION 归档` 直接抛 `Illegal mix of collations for operation 'UNION'`，
 * 登录热力图 500。查询里已经用 `CONVERT(... USING utf8mb4)` 兜住（不依赖列定义），
 * 这里再把列定义对齐 —— 两道防线：
 *   · 查询侧兜底：任何"未来又建歪了"的归档表也不会炸；
 *   · 列侧对齐：让手写 SQL、报表工具、以后新增的聚合查询都不必记得加 CONVERT。
 *
 * 只改**同一字符集内的排序规则**（utf8mb4 → utf8mb4），不改类型、不丢数据；
 * 已经是目标排序规则的列会被跳过（幂等）。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */

/** 目标排序规则（与 session_logs / audit_logs 一致） */
const TARGET_COLLATION = 'utf8mb4_general_ci';

/** 待对齐的 (表, 列) */
const COLUMNS = [
  ['log_stats_login_pairs', 'ip'],
  ['log_stats_ips', 'ip'],
  ['log_stats_hourly', 'scope']
];

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  for (const [table, column] of COLUMNS) {
    const [exists] = await queryInterface.sequelize.query('SHOW TABLES LIKE ?', { replacements: [table] });
    if (exists.length === 0) continue;

    const [info] = await queryInterface.sequelize.query(
      `SELECT COLUMN_TYPE AS type, COLLATION_NAME AS coll
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      { replacements: [table, column] }
    );
    const row = info?.[0];
    if (!row) continue;
    if (row.coll === TARGET_COLLATION) continue;

    /* `type` 取自 information_schema，不含注入面；列名是下面的常量表 */
    await queryInterface.sequelize.query(
      `ALTER TABLE \`${table}\` MODIFY \`${column}\` ${row.type} CHARACTER SET utf8mb4 COLLATE ${TARGET_COLLATION}`
    );
  }
}

/**
 * 回滚：不改回去
 *
 * 新排序规则是"与源表一致"的正确状态，回滚到 unicode_ci 只会把 UNION 的坑放回来。
 *
 * @returns {Promise<void>}
 */
export async function down() {
  /* 有意为空 */
}
