/**
 * 迁移：会话/审计日志热路径复合索引
 *
 * === 依据（2026-09-19 EXPLAIN 取证，详见文件尾注释） ===
 *   ① `anomaly-detector.js countRecentFailures`（登录热路径，每次失败登录都跑）：
 *      WHERE event='LOGIN_FAILED' AND created_at >= ? [AND ip=?]
 *      → 改前 type=ALL **全表扫描**：现有唯一索引 (user_id,event,created_at)
 *        最左列是 user_id，event-only 条件用不上。
 *   ② `session-governance.js getLoginTrend`：
 *      WHERE event='LOGIN' AND created_at >= ? GROUP BY DATE(created_at)
 *      → 改前 index 扫描 + temporary + filesort。
 *   ③ `audit-logger.js getAuditLogs`：
 *      WHERE event=? / user_id=? ORDER BY created_at DESC
 *      → 改前 ref + filesort（单列索引排不了 created_at）。
 *
 * 索引数量守恒：audit_logs 用复合索引**替换**两个单列索引（它们的全部查询
 * 场景都带 created_at 排序），不给写放大净增条目；session_logs 是纯新增
 * （原复合索引服务 user_id 维度，仍需要）。
 */

export async function up({ queryInterface }) {
  // ①+② session_logs：event → created_at 顺序的复合（event 等值 + created_at 范围/分组）
  await safeAddIndex(queryInterface, 'session_logs', ['event', 'created_at'], {
    name: 'idx_session_log_event_created'
  });

  // ③ audit_logs：单列 → 同列集复合，查询计划从 ref+filesort 变为 ref（索引即序）
  await safeRemoveIndex(queryInterface, 'audit_logs', 'audit_logs_event');
  await safeAddIndex(queryInterface, 'audit_logs', ['event', 'created_at'], {
    name: 'audit_logs_event_created'
  });
  await safeRemoveIndex(queryInterface, 'audit_logs', 'audit_logs_user_id');
  await safeAddIndex(queryInterface, 'audit_logs', ['user_id', 'created_at'], {
    name: 'audit_logs_user_id_created'
  });
}

export async function down({ queryInterface }) {
  await safeRemoveIndex(queryInterface, 'session_logs', 'idx_session_log_event_created');
  await safeRemoveIndex(queryInterface, 'audit_logs', 'audit_logs_event_created');
  await safeRemoveIndex(queryInterface, 'audit_logs', 'audit_logs_user_id_created');
  await safeAddIndex(queryInterface, 'audit_logs', ['event'], { name: 'audit_logs_event' });
  await safeAddIndex(queryInterface, 'audit_logs', ['user_id'], { name: 'audit_logs_user_id' });
}

async function safeAddIndex(queryInterface, table, columns, options) {
  try {
    await queryInterface.addIndex(table, columns, options);
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

async function safeRemoveIndex(queryInterface, table, indexName) {
  try {
    await queryInterface.removeIndex(table, indexName);
  } catch (err) {
    if (!/check that the (column\/key )?index exists|-1071/i.test(err.message)) throw err;
  }
}

/**
 * EXPLAIN 取证（2026-09-19，dev 库，行数见括号内）
 *
 * ── session_logs 失败登录计数（3 行）
 *    改前: type=ALL key=null            extra=Using where          ← 全表扫描
 *    改后: type=range key=idx_session_log_event_created extra=Using index condition; Using where
 * ── session_logs 登录趋势（3 行）
 *    改前: type=index key=idx_session_log_audit  extra=Using where; Using index; Using temporary; Using filesort
 *    改后: type=ref  key=idx_session_log_event_created extra=Using where; Using index; Using temporary; Using filesort
 *    （WHERE 部分已走新索引；GROUP BY DATE(created_at) 是函数分组，temporary/filesort
 *      无法用索引序消除 —— 如实留档，该查询只在管理端低频调用）
 * ── audit_logs 按事件（46 行）
 *    改前: type=ref  key=audit_logs_event        extra=Using index condition; Using where; Using filesort
 *    改后: type=ref  key=audit_logs_event_created extra=Using index condition（无 filesort）
 * ── audit_logs 按用户（46 行）
 *    改前: type=ref  key=audit_logs_user_id      extra=Using where; Using filesort
 *    改后: type=ref  key=audit_logs_user_id_created extra=Using index condition（无 filesort）
 *
 * ⚠️ 取证库行数很小，优化器在小表上可能仍选全表扫描 —— 复合索引的价值在
 * 数据量增长后兑现（登录失败计数与审计表都是随时间单调增长的表）。
 * 取证时行数与计划一并留档，避免后人拿小表结果质疑索引无用。
 */
