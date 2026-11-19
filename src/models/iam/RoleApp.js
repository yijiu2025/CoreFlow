/**
 * 角色 → 数据可见的应用（数据范围的应用维度）
 *
 * 与 `RoleDept` 并列：部门维度回答"看哪些部门"，应用维度回答"看哪个应用的账号"，
 * 两者同时存在时取交集。表为空 = 不限应用（保持既有行为，新装不必配）。
 *
 * 为什么不用 JSON 列：应用标识会改名 / 下架，关联表能整行清理，JSON 只会留下失效 id。
 *
 * @author yijiu2025
 * @since 2026-11-18
 */
const defineRoleApp = (sequelize, DataTypes) => {
  const RoleApp = sequelize.define(
    'RoleApp',
    {
      role_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '角色 ID' },
      app_id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false, comment: '数据可见的应用标识' }
    },
    {
      tableName: 'iam_role_app',
      timestamps: false,
      comment: '角色数据范围（应用维度）'
    }
  );

  return RoleApp;
};

export default defineRoleApp;
