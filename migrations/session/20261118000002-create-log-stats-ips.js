/**
 * 迁移：登录归档的「来源 IP」存在性表
 *
 * 与 `log_stats_users` 同构、同理由：登录日志页的「账号数 / 来源 IP」是
 * `COUNT(DISTINCT user_id)` / `COUNT(DISTINCT ip)`，这类指标**不能用计数相加** ——
 * 同一个账号/同一台机器在两个小时桶里各算 1，相加就变成了两个。
 *
 * 只存登录侧（`session_logs`）的 IP：操作日志页没有「来源 IP」这张卡，
 * 多存一份没有读者。
 *
 * 幂等：表已存在时跳过。
 */
export async function up({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query('SHOW TABLES LIKE ?', { replacements: ['log_stats_ips'] });
  if (rows.length > 0) return;

  await queryInterface.sequelize.query(`
    CREATE TABLE log_stats_ips (
      bucket_start DATETIME NOT NULL COMMENT '小时桶起点（整点）',
      ip VARCHAR(64) NOT NULL COMMENT '该小时出现过的来源 IP',
      PRIMARY KEY (bucket_start, ip)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='登录归档：来源 IP 存在性，用于与明细合并后精确去重'
  `);
}

export async function down({ queryInterface }) {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS log_stats_ips');
}
