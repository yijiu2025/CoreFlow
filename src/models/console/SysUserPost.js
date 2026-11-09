/**
 * 用户岗位关联模型（sys_user_post）
 *
 * 用户与岗位是多对多，故不进 `iam_user`（认证主表只放身份相关字段）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysUserPost = (sequelize, DataTypes) => {
  const SysUserPost = sequelize.define(
    'SysUserPost',
    {
      user_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '用户内部 ID' },
      post_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '岗位 ID' }
    },
    {
      tableName: 'sys_user_post',
      timestamps: true,
      comment: '用户与岗位关联表'
    }
  );

  return SysUserPost;
};

export default defineSysUserPost;
