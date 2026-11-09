/**
 * 字典项模型（sys_dict_data）
 *
 * 同一 `dict_type` 下只允许一个默认项（`is_default=1`）：服务层在设新默认时
 * 会先把同类型的旧默认清零，前端不必处理「两个默认」这种非法状态。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysDictData = (sequelize, DataTypes) => {
  const SysDictData = sequelize.define(
    'SysDictData',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      dict_type: { type: DataTypes.STRING(100), allowNull: false, comment: '所属字典标识' },
      label: { type: DataTypes.STRING(100), allowNull: false, comment: '显示文本' },
      value: { type: DataTypes.STRING(100), allowNull: false, comment: '存储值' },
      sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
      status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
      tone: { type: DataTypes.STRING(20), allowNull: true, comment: '前端标签色调 cat-1~cat-5' },
      is_default: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '是否默认项' },
      remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' }
    },
    {
      tableName: 'sys_dict_data',
      timestamps: true,
      comment: '字典项表'
    }
  );

  return SysDictData;
};

export default defineSysDictData;
