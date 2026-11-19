/**
 * 给 `user_user` 加人员职级并回填（幂等）
 *
 * 与 `migrations/user/20261119000001-add-user-rank-level.js` 等价 ——
 * 迁移会在 `npm run migrate` 时执行；这个脚本用于**不跑全量迁移**的场景
 * （例如只想补这一列，而工作区里还压着别人的未执行迁移）。
 *
 * 用法：
 *   node --env-file=.env scripts/backfill-user-rank.mjs           # 预览
 *   node --env-file=.env scripts/backfill-user-rank.mjs --apply   # 执行
 *
 * 回填口径：该用户所有未删除角色里的最高 `rank_level`，与拆分前的判定完全一致。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { sequelize } from '../src/framework/persistence/db/index.js';

const APPLY = process.argv.includes('--apply');

/**
 * 列是否存在
 *
 * @param {string} table 表名
 * @param {string} column 列名
 * @returns {Promise<boolean>} 是否存在
 */
async function hasColumn(table, column) {
  const [rows] = await sequelize.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * 预览：有多少用户的职级会变化
 *
 * @returns {Promise<object>} 统计
 */
async function preview() {
  const [rows] = await sequelize.query(`
    SELECT
      COUNT(*) AS total,
      SUM(t.max_rank IS NOT NULL AND t.max_rank <> u.rank_level) AS diff,
      MAX(t.max_rank) AS max_rank
    FROM user_user u
    LEFT JOIN (
      SELECT ur.user_id, MAX(r.rank_level) AS max_rank
        FROM iam_user_role ur
        JOIN iam_role r ON r.id = ur.role_id AND r.delete_version = 0
       WHERE ur.delete_version = 0
       GROUP BY ur.user_id
    ) t ON t.user_id = u.id
    WHERE u.deleted_at IS NULL
  `);
  return rows[0] || {};
}

async function main() {
  const exists = await hasColumn('user_user', 'rank_level');
  console.log(`列 user_user.rank_level：${exists ? '已存在' : '不存在'}`);

  if (!exists) {
    if (!APPLY) {
      console.log('（预览模式）将新增列 rank_level INT NOT NULL DEFAULT 0');
      return;
    }
    await sequelize.query(`
      ALTER TABLE \`user_user\`
      ADD COLUMN \`rank_level\` INT NOT NULL DEFAULT 0
      COMMENT '人员职级(0-99)：决定能管理多高的人，与角色权重是两件事'
    `);
    console.log('✅ 已新增列');
  }

  const stat = await preview();
  console.log(`用户总数 ${stat.total ?? 0}，需要回填 ${stat.diff ?? 0}，最高职级 ${stat.max_rank ?? 0}`);

  if (!APPLY) {
    console.log('（预览模式）加 --apply 执行回填');
    return;
  }

  await sequelize.query(`
    UPDATE user_user u
    LEFT JOIN (
      SELECT ur.user_id, MAX(r.rank_level) AS max_rank
        FROM iam_user_role ur
        JOIN iam_role r ON r.id = ur.role_id AND r.delete_version = 0
       WHERE ur.delete_version = 0
       GROUP BY ur.user_id
    ) t ON t.user_id = u.id
       SET u.rank_level = COALESCE(t.max_rank, 0)
  `);
  const after = await preview();
  console.log(`✅ 回填完成，剩余差异 ${after.diff ?? 0}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
