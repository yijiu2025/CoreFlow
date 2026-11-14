/**
 * 数据范围（行级数据权限）：角色新增 data_scope + 自定义部门关联表
 *
 * 本仓在此之前只有两层权限：**接口能力**（PBAC policy）与**菜单可见性**
 * （sys_role_menu）。两者都回答"能不能调 / 能不能看见"，没有一处回答
 * "能看见哪些行"。于是"本部门只能看本部门的用户"这类规则只能靠前端筛选，
 * 换个接口就绕过 —— 这是这个迁移存在的唯一理由。
 *
 * 五档取值与参考实现（若依系）一致，便于运维迁移心智：
 *   1 全部数据 / 2 自定义 / 3 本部门 / 4 本部门及以下 / 5 仅本人
 *
 * `iam_role_dept` 只在 `data_scope = 2`（自定义）时有意义，存"这个角色能看哪些部门"。
 * 用独立关联表而不是 JSON 列：部门会被删除/移动，关联表能跟着外键清理，
 * JSON 里存 id 只会在部门删除后变成一串悬空值。
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('iam_role', 'data_scope', {
    type: Sequelize.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '数据范围：1 全部 / 2 自定义 / 3 本部门 / 4 本部门及以下 / 5 仅本人'
  });

  await queryInterface.createTable('iam_role_dept', {
    role_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      primaryKey: true,
      comment: '角色 ID'
    },
    dept_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      primaryKey: true,
      comment: '可见部门 ID'
    }
  });

  await queryInterface.addIndex('iam_role_dept', ['dept_id'], {
    name: 'idx_role_dept_dept'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('iam_role_dept');
  await queryInterface.removeColumn('iam_role', 'data_scope');
}
