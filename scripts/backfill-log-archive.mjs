#!/usr/bin/env node
/**
 * 一次性回填：把 audit_logs 里还留着的「登录事件」补成登录侧归档
 *
 * === 为什么需要它 ===
 * 登录事件在**两张表**里各写一份（`session_logs` 给登录日志页与脉搏，`audit_logs` 给操作审计）。
 * 清过一次「登录日志」之后 `session_logs` 空了、脉搏也就空了，但 `audit_logs` 里那份**还在**
 * （它被 `OPER_ONLY_SQL` 排除在操作统计之外，所以从没在"操作日志"页露过脸）。
 *
 * 归档机制（20261118000001-create-log-stats）从 2026-11-17 起才在清理时落聚合，
 * 更早的历史没有归档 —— 这个脚本就是拿 `audit_logs` 那份残留把登录侧归档补齐。
 *
 * === 幂等 ===
 * 同一小时桶若已有归档，取 `GREATEST(已有, 回填)`，重复跑不会翻倍。
 * 已在 `session_logs` 里存在的同一事件不会被重复计入 —— 脚本只补"明细里已经没有"的部分：
 * 它按小时桶比对，桶内明细条数 ≥ 回填条数时跳过该桶。
 *
 * 用法：
 *   node --env-file=.env scripts/backfill-log-archive.mjs           # 干跑，只打印
 *   node --env-file=.env scripts/backfill-log-archive.mjs --apply   # 写库
 */
import { getModel, sequelize } from '../src/framework/persistence/db/index.js';
import { loadAllModels } from '../src/framework/persistence/db/models.js';

const APPLY = process.argv.includes('--apply');

/** 登录事件：成功与失败都要（脉搏的 total 含失败，failed 单列） */
const LOGIN_EVENT_SQL = `event LIKE 'LOGIN%'`;
const FAILED_SQL = `event LIKE '%FAIL%'`;

async function main() {
  await loadAllModels();
  getModel('AuditLog');

  const rows = await sequelize.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS bucket,
            COUNT(*) AS total,
            SUM(${FAILED_SQL}) AS failed,
            COUNT(DISTINCT CASE WHEN ${FAILED_SQL} THEN NULL ELSE user_id END) AS users
       FROM audit_logs
      WHERE ${LOGIN_EVENT_SQL}
      GROUP BY bucket ORDER BY bucket ASC`,
    { type: 'SELECT' }
  );

  if (rows.length === 0) {
    console.log('audit_logs 里没有登录事件，无需回填');
    return;
  }

  // 同一小时桶里已经有多少明细：够数就跳过（避免与现存日志重复计）
  const raw = await sequelize.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS bucket, COUNT(*) AS c
       FROM session_logs GROUP BY bucket`,
    { type: 'SELECT' }
  );
  const rawByBucket = new Map(raw.map(r => [String(r.bucket), Number(r.c)]));

  const plan = rows.filter(r => Number(r.total) > Number(rawByBucket.get(String(r.bucket)) || 0));
  const totalCount = plan.reduce((s, r) => s + Number(r.total), 0);
  const failedCount = plan.reduce((s, r) => s + Number(r.failed || 0), 0);

  console.log(`来源：audit_logs 里的登录事件 ${rows.length} 个小时桶`);
  console.log(`待回填：${plan.length} 个桶 / ${totalCount} 条（失败 ${failedCount} 条）`);
  for (const r of plan.slice(0, 10)) console.log('   ', r.bucket, 'total=' + r.total, 'failed=' + (r.failed || 0));
  if (plan.length > 10) console.log(`    …其余 ${plan.length - 10} 个桶`);

  if (!APPLY) {
    console.log('\n干跑结束。确认无误后加 --apply 写库。');
    return;
  }

  await sequelize.transaction(async transaction => {
    for (const r of plan) {
      await sequelize.query(
        `INSERT INTO log_stats_hourly (scope, bucket_start, total, failed)
         VALUES ('login', :bucket, :total, :failed)
         ON DUPLICATE KEY UPDATE
           total = GREATEST(total, VALUES(total)),
           failed = GREATEST(failed, VALUES(failed))`,
        { replacements: { bucket: r.bucket, total: Number(r.total), failed: Number(r.failed || 0) }, transaction }
      );
    }
    // 账号存在性：成功登录的 user_id（供活跃账号数去重）
    await sequelize.query(
      `INSERT IGNORE INTO log_stats_users (bucket_start, user_id)
       SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00'), user_id
         FROM audit_logs
        WHERE ${LOGIN_EVENT_SQL} AND NOT (${FAILED_SQL}) AND user_id IS NOT NULL
        GROUP BY 1, 2`,
      { transaction }
    );

    // 来源 IP 存在性：登录日志页的「来源 IP」卡同样要能算上已清理的那段
    await sequelize.query(
      `INSERT IGNORE INTO log_stats_ips (bucket_start, ip)
       SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00'), ip
         FROM audit_logs
        WHERE ${LOGIN_EVENT_SQL} AND ip IS NOT NULL AND ip <> ''
        GROUP BY 1, 2`,
      { transaction }
    );
  });

  console.log('\n✓ 已写入归档表（log_stats_hourly scope=login / log_stats_users）');
}

main()
  .catch(err => {
    console.error('回填失败：', err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
