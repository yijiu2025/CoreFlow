/**
 * 给 `user_user` 加人员职级
 *
 * 背景：职级原来只存在于 `iam_role.rank_level`，用户的实际职级是"所有角色里的最高值"。
 * 这让"授一个高角色"等于"顺手给人升了职" —— 副作用不可见，也没法单独调。
 *
 * 本迁移只加列并回填（回填用同一个口径：max(角色 rank)），因此**管理判定的结果不变**，
 * 只是把数据的归属挪到正确的位置。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
export async function up({ queryInterface }) {
  const table = 'user_user';
  const desc = await queryInterface.describeTable(table);
  if (!desc.rank_level) {
    await queryInterface.addColumn(table, 'rank_level', {
      type: 'INTEGER',
      allowNull: false,
      defaultValue: 0,
      comment: '人员职级(0-99)：决定能管理多高的人，与角色权重是两件事'
    });
  }

  /*
   * 回填：取该用户**未删除角色**里的最高 rank（没有角色则为 0）。
   *
   * 必须在同一条 SQL 里算，不能用脚本逐行：生产库上十万级用户时逐行会跑到超时。
   */
  await queryInterface.sequelize.query(`
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
}

export async function down({ queryInterface }) {
  const desc = await queryInterface.describeTable('user_user');
  if (desc.rank_level) await queryInterface.removeColumn('user_user', 'rank_level');
}
