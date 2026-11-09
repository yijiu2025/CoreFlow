/**
 * 部门模型（sys_dept）
 *
 * `ancestors` 存 `0,1,3` 形式的上级链（不含自身），由服务层在创建 / 移动时维护：
 * 有它才能一次 `LIKE '%,id,%'` 查出「本部门及下级」，避免递归查询。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysDept = (sequelize, DataTypes) => {
  const SysDept = sequelize.define(
    'SysDept',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      parent_id: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '上级部门，0 为根' },
      ancestors: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '0', comment: '上级链，如 0,1,3' },
      name: { type: DataTypes.STRING(50), allowNull: false, comment: '部门名称' },
      leader: { type: DataTypes.STRING(50), allowNull: true, comment: '负责人' },
      phone: { type: DataTypes.STRING(20), allowNull: true, comment: '联系电话' },
      email: { type: DataTypes.STRING(100), allowNull: true, comment: '邮箱' },
      sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
      status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' }
    },
    {
      tableName: 'sys_dept',
      timestamps: true,
      comment: '部门表'
    }
  );

  return SysDept;
};

export default defineSysDept;
