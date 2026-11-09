/**
 * 字典类型模型（sys_dict_type）
 *
 * `dict_type` 是业务代码引用的稳定标识，创建后不可修改；改名只改 `dict_name`。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysDictType = (sequelize, DataTypes) => {
  const SysDictType = sequelize.define(
    'SysDictType',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      dict_name: { type: DataTypes.STRING(100), allowNull: false, comment: '字典名称' },
      dict_type: { type: DataTypes.STRING(100), allowNull: false, comment: '字典标识' },
      status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
      remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' }
    },
    {
      tableName: 'sys_dict_type',
      timestamps: true,
      comment: '字典类型表'
    }
  );

  return SysDictType;
};

export default defineSysDictType;
