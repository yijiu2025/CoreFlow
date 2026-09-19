/**
 * 迁移：作品域列表查询复合索引
 *
 * === 依据（2026-09-19 EXPLAIN 取证，详见文件尾注释） ===
 * 作品/模板/分析记录的主列表查询形态全部是
 *   WHERE <维度等值> [AND delete_version=0] ORDER BY created_at DESC LIMIT n
 * 而现有索引把过滤列与排序列拆成了**两个单列索引** —— 排序永远落不到索引上，
 * 改前 EXPLAIN 均为 ALL/ref + Using filesort。
 *
 * 用复合索引替换单列（左最前缀完全覆盖原单列），索引总数不增：
 *   posecraft_work      status   → (status, created_at)
 *   posecraft_work      user_id  → (user_id, created_at)
 *   posecraft_template  status   → (status, created_at)
 *   posecraft_analysis  user_id  → (user_id, created_at)
 * analysis_type / template_id / category / is_template_work 等单列保持不动。
 */

export async function up({ queryInterface }) {
  await swapIndex(queryInterface, 'posecraft_work', 'idx_work_status', ['status', 'created_at'], 'idx_work_status_created');
  await swapIndex(queryInterface, 'posecraft_work', 'idx_work_user', ['user_id', 'created_at'], 'idx_work_user_created');
  await swapIndex(queryInterface, 'posecraft_template', 'idx_template_status', ['status', 'created_at'], 'idx_template_status_created');
  await swapIndex(queryInterface, 'posecraft_analysis', 'idx_analysis_user', ['user_id', 'created_at'], 'idx_analysis_user_created');
}

export async function down({ queryInterface }) {
  await swapIndex(queryInterface, 'posecraft_work', 'idx_work_status_created', ['status'], 'idx_work_status');
  await swapIndex(queryInterface, 'posecraft_work', 'idx_work_user_created', ['user_id'], 'idx_work_user');
  await swapIndex(queryInterface, 'posecraft_template', 'idx_template_status_created', ['status'], 'idx_template_status');
  await swapIndex(queryInterface, 'posecraft_analysis', 'idx_analysis_user_created', ['user_id'], 'idx_analysis_user');
}

/** 先建新索引再删旧的（交换窗口内查询不退化为全扫），均幂等 */
async function swapIndex(queryInterface, table, dropName, columns, addName) {
  await safeAddIndex(queryInterface, table, columns, { name: addName });
  await safeRemoveIndex(queryInterface, table, dropName);
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
 * EXPLAIN 取证（2026-09-19，dev 库；行数：work=7 template=11 analysis=0）
 *
 * ── work 公开列表（delete_version=0 AND status=1 ORDER BY created_at DESC）
 *    改前: type=ALL key=null  extra=Using where; Using filesort
 *    改后: type=ALL key=null  extra=Using where; Using filesort
 *    （取证库仅 7 行，优化器小表偏好全扫；同形态的 template（11 行）已实测
 *      改后走 idx_template_status_created 且无 filesort，work 数据量增长后同样兑现）
 * ── work 用户列表（user_id=? AND delete_version=0 ORDER BY created_at DESC）
 *    改前: type=ALL key=null  extra=Using where; Using filesort
 *    改后: type=ALL key=null（同上，小表偏好全扫）
 * ── template 公开列表
 *    改前: type=ref key=idx_template_status  extra=Using where; Using filesort
 *    改后: type=ref key=idx_template_status_created extra=Using where（无 filesort）
 * ── analysis 用户历史
 *    改前: type=index key=idx_analysis_created（全索引扫描兜底）
 *    改后: type=ref  key=idx_analysis_user_created extra=Using where; Using index
 *
 * ⚠️ 取证库行数很小，优化器在小表上可能仍选全表扫描 —— 这些列表查询是
 * 随业务量线性增长的主路径，复合索引的价值在数据量增长后兑现。
 */
