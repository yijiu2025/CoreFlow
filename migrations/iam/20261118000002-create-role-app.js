/**
 * 数据范围（行级）：角色新增「应用维度」—— `iam_role_app`
 *
 * 背景：`data_scope` 只解决了"能看哪些部门"，但用户属于多个应用时还有第二个维度：
 * "只能看某个应用里的账号"。例如客服主管的角色挂在 console，数据范围却应该只覆盖
 * posecraft 的用户；靠角色本身所属的 app 表达不了这件事（那是**动作域**，决定能调
 * 哪个应用的接口，两者正交）。
 *
 * 语义（与 `iam_role_dept` 并列、取交集）：
 *   · 表里没有记录 → 不限应用（沿用旧行为）；
 *   · 有记录 → 目标用户必须在其中某个应用下**有角色**才可见 / 可管。
 *
 * 用独立关联表而不是 JSON 列：应用标识会被改名/下架，关联表能整行清理，
 * JSON 里只会留下一串失效 id。
 *
 * @author yijiu2025
 * @since 2026-11-18
 */
export async function up({ queryInterface, Sequelize }) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some(t => Object.values(t)[0] === 'iam_role_app');
  if (exists) return;

  await queryInterface.createTable('iam_role_app', {
    role_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      primaryKey: true,
      comment: '角色 ID'
    },
    app_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
      primaryKey: true,
      comment: '数据可见的应用标识'
    }
  });

  await queryInterface.addIndex('iam_role_app', ['app_id'], {
    name: 'idx_role_app_app'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('iam_role_app');
}
