/**
 * 岗位表加「职级」（sys_post.rank）
 *
 * 背景：岗位阶梯要按**职级**分层展示（同一职级多个岗位并排在同一层台阶），
 * 而此前只有 `sort`（同一列表里的排序位）。两者语义不同：
 *   - `sort` 决定"谁排在前面"，同名岗位改个顺序就会把它们拆到不同层；
 *   - `rank` 是组织结构上的层级（1 级最高 / 越大越低由业务自定），与排序解耦。
 * 用一个字段兼任两件事，就会出现"调个顺序，层级跟着变了"的错乱。
 *
 * 回填：`rank = sort`。这样存量数据在阶梯上的分层与改造前**完全一致**——
 * 迁移不应该顺手改变用户已习惯的视图，只提供新的表达方式。
 *
 * 为什么是 TINYINT 而不是建一张"职级字典表"：目前只需要一个可比较的序号，
 * 没有级别名称/薪酬带宽/晋升规则这些属性。真需要时再加表，`rank` 作为外键即可，
 * 那时是一次显式迁移，而不是现在先臆造一套字典。
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('sys_post', 'rank', {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0,
    after: 'post_name',
    comment: '职级：同一职级的岗位在阶梯上并排（0 = 未设置）'
  });

  // 存量回填：沿用 sort，保证分层与改造前一致
  await queryInterface.sequelize.query('UPDATE sys_post SET `rank` = `sort` WHERE `rank` = 0');
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('sys_post', 'rank');
}
