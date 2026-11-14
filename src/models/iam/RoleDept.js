/**
 * 角色 → 可见部门（数据范围 = 自定义 时生效）
 *
 * 独立关联表而不是把部门 id 塞进 JSON：部门会被删除/移动，关联表能跟着清理，
 * JSON 里只会留下一串悬空 id。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
const defineRoleDept = (sequelize, DataTypes) => {
  const RoleDept = sequelize.define(
    'RoleDept',
    {
      role_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '角色 ID' },
      dept_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '可见部门 ID' }
    },
    {
      tableName: 'iam_role_dept',
      timestamps: false,
      comment: '角色可见部门（数据范围自定义）'
    }
  );

  return RoleDept;
};

export default defineRoleDept;
