/**
 * 撤销岗位「职级」列（sys_post.rank）
 *
 * 上一版给岗位加了 `rank` 想做阶梯分层，但结论反过来了：分层依据本来就该由
 * **既有数据**表达，不该为此新增一个要人手工维护的字段 —— 运维填了一处还得
 * 记得同步列表排序，多一个字段反而多一个不一致源。
 *
 * 现在的口径：**`sort` 相同 = 同一级**，岗位阶梯把它们并排在同一层台阶上。
 * `sort` 本来就在用（列表先后），换成它之后没有新增字段、没有新增维护成本。
 *
 * 用一条新的正向迁移（而不是 undo 上一条）：`20261114000002` 已经在本机与
 * 其它环境执行过，改历史会让各环境的分支状态对不上。
 */
export async function up({ queryInterface }) {
  await queryInterface.removeColumn('sys_post', 'rank');
}

export async function down({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('sys_post', 'rank', {
    type: Sequelize.INTEGER,
    allowNull: false,
    defaultValue: 0,
    after: 'post_name',
    comment: '职级（已废弃：分层改用 sort 相同即同级）'
  });
}
