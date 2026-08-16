/**
 * posecraft_follow 表添加 mutual 字段（互关标记）
 * 关注/取消关注时实时维护，查询互关数无需二次 JOIN
 */
export async function up({ queryInterface, Sequelize }) {
  const tableDesc = await queryInterface.describeTable('posecraft_follow');
  const columns = Object.keys(tableDesc);

  if (!columns.includes('mutual')) {
    await queryInterface.addColumn('posecraft_follow', 'mutual', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: '是否互关（双方都关注对方）'
    });
  }

  // 加索引加速互关数查询
  try {
    await queryInterface.addIndex('posecraft_follow', ['follower_id', 'mutual', 'delete_version'], {
      name: 'idx_follow_mutual'
    });
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

export async function down({ queryInterface }) {
  const tableDesc = await queryInterface.describeTable('posecraft_follow');
  const columns = Object.keys(tableDesc);
  if (columns.includes('mutual')) {
    await queryInterface.removeColumn('posecraft_follow', 'mutual');
  }
}
