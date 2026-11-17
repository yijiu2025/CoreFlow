/**
 * 迁移：日志归档统计表（清日志不丢统计）
 *
 * === 为什么需要这两张表 ===
 * 「清除日志」删的是 `audit_logs` / `session_logs` 的**明细**，而工作台的登录脉搏、
 * 成功率、今日操作、近 7 天趋势全都直接 `COUNT` 这两张表 —— 一清日志，看板就归零，
 * 用户看到的是"我把日志清了，怎么统计也没了"（2026-11-17 反馈）。
 *
 * 统计与明细本来就是两类数据：明细服务于"谁在什么时候做了什么"的追溯，统计服务于
 * "这段时间的整体走势"。所以清除时**先把聚合落一份再删明细**，读的时候把两段相加：
 *
 *   · `log_stats_hourly` —— 按**小时桶**存 total / failed。取小时粒度是因为登录脉搏的
 *     24 小时档就是按小时出点的（`%m-%d %H:00`），日粒度补不出那条曲线；7d / 30d 由
 *     小时桶按日汇总而来，不会失真。
 *   · `log_stats_users` —— 存「某小时有过成功登录的账号」。独立账号数（COUNT DISTINCT）
 *     是最容易被"相加"搞错的口径：同一个账号在两个桶里都登录过，桶里各算 1，直接相加
 *     就变成 2。存下 user_id 才能在"明细 ∪ 归档"上重新去重。
 *
 * 两张表都只增不改语义：写入只发生在清除日志的同一事务里，明细删掉的同时归档落库，
 * 不存在"删了但没归档"的中间态。
 *
 * 幂等：表已存在时跳过。
 */
export async function up({ queryInterface }) {
  const tableExists = async table => {
    const [rows] = await queryInterface.sequelize.query('SHOW TABLES LIKE ?', { replacements: [table] });
    return rows.length > 0;
  };

  if (!(await tableExists('log_stats_hourly'))) {
    await queryInterface.sequelize.query(`
      CREATE TABLE log_stats_hourly (
        scope VARCHAR(8) NOT NULL COMMENT '日志类型: oper / login',
        bucket_start DATETIME NOT NULL COMMENT '小时桶起点（整点）',
        total INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '该桶内的记录条数',
        failed INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '其中失败/被拒的条数',
        PRIMARY KEY (scope, bucket_start)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='日志归档统计：清除日志前按小时桶累计，读统计时与明细相加'
    `);
  }

  if (!(await tableExists('log_stats_users'))) {
    await queryInterface.sequelize.query(`
      CREATE TABLE log_stats_users (
        bucket_start DATETIME NOT NULL COMMENT '小时桶起点（整点）',
        user_id BIGINT NOT NULL COMMENT '该小时成功登录过的账号',
        PRIMARY KEY (bucket_start, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='登录归档：成功登录的账号存在性，用于与明细合并后精确去重'
    `);
  }
}

export async function down({ queryInterface }) {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS log_stats_users');
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS log_stats_hourly');
}
