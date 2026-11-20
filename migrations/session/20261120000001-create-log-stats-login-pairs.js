/**
 * 迁移：登录归档的「IP × 账号」明细立方
 *
 * === 为什么还要第四张归档表 ===
 * 已有的三张表都答不了「异常来源」这张卡：
 *
 *   · `log_stats_hourly` —— 只有小时总量，没有 ip / user 维度；
 *   · `log_stats_users`  —— 只有"某小时成功登录过的账号"，没失败数、没有 ip；
 *   · `log_stats_ips`    —— 只有"某小时出现过的 ip"，没失败数、没有 user。
 *
 * 而异常面板要的是「某 IP 的失败次数 + 它试过多少个不同账号（spread）」「某账号
 * 失败了多次 + 来自多少个不同 IP」。这两个 spread 都是 `COUNT(DISTINCT …)`，
 * **两段各算再相加一定错**（同一 IP 清理前后各出现一次、涉及的账号有交集，相加就把
 * 交集算了两次）。要精确只能把集合留到读的时候再 distinct —— 也就是归档必须保留
 * (小时, IP, 账号) 这个最小立方。
 *
 * 粒度选择：小时而不是分钟，与 `log_stats_hourly` 同一口径；一个 (桶, ip, 账号)
 * 只落一行，`total/failed` 是这一小时内的计数。首末时间单独存（`first_at/last_at`），
 * 否则归档侧只能报"某小时"，而明细侧报的是精确到秒 —— 面板上两段时间的格式会不一致。
 *
 * 只存登录侧：操作热力没有异常来源面板，多存一份没有读者。
 *
 * 幂等：表已存在时跳过。
 */
export async function up({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query('SHOW TABLES LIKE ?', {
    replacements: ['log_stats_login_pairs']
  });
  if (rows.length > 0) return;

  await queryInterface.sequelize.query(`
    CREATE TABLE log_stats_login_pairs (
      bucket_start DATETIME NOT NULL COMMENT '小时桶起点（整点）',
      ip VARCHAR(64) NOT NULL DEFAULT '' COMMENT '来源 IP（空串 = 取不到）',
      user_id BIGINT NOT NULL DEFAULT 0 COMMENT '账号 ID（0 = 匿名/未识别，读时按 NULL 处理）',
      total INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '该桶内该 IP×账号 的记录数',
      failed INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '其中失败/被拒的条数',
      first_at DATETIME NOT NULL COMMENT '该组最早一条的时间（保留秒级）',
      last_at DATETIME NOT NULL COMMENT '该组最晚一条的时间（保留秒级）',
      PRIMARY KEY (bucket_start, ip, user_id),
      KEY idx_ip (ip, bucket_start),
      KEY idx_user (user_id, bucket_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='登录归档立方：异常来源（Top IP / Top 账号）在清理日志后仍可精确统计'
  `);
}

export async function down({ queryInterface }) {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS log_stats_login_pairs');
}
