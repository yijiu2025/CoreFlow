/**
 * 岗位模型（sys_post）
 *
 * 岗位编码唯一且创建后不建议修改：历史审计记录按编码回溯可读性依赖它。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysPost = (sequelize, DataTypes) => {
  const SysPost = sequelize.define(
    'SysPost',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      post_code: { type: DataTypes.STRING(50), allowNull: false, comment: '岗位编码' },
      post_name: { type: DataTypes.STRING(50), allowNull: false, comment: '岗位名称' },
      sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
      status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
      remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' }
    },
    {
      tableName: 'sys_post',
      timestamps: true,
      comment: '岗位表'
    }
  );

  return SysPost;
};

export default defineSysPost;
