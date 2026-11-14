/**
 * 后台管理（console）用户个人资料：昵称 / 头像 / 界面偏好
 *
 * 只属于 console：`user_user` 是共享身份表，那里的 username / avatar 是全局身份；
 * "在后台里显示成什么名字、用什么头像"是展示层选择，换个应用可能想显示另一套。
 * 所以这张表放 console 域，一个用户一行；字段为空时前端回落到全局值。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
const defineConsoleUserProfile = (sequelize, DataTypes) => {
  const ConsoleUserProfile = sequelize.define(
    'ConsoleUserProfile',
    {
      user_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '用户内部 ID' },
      nickname: { type: DataTypes.STRING(64), allowNull: true, comment: '后台内昵称（空 = username）' },
      avatar: { type: DataTypes.STRING(255), allowNull: true, comment: '后台内头像（空 = 全局头像）' },
      preferences: { type: DataTypes.JSON, allowNull: true, comment: '界面偏好：{ accent? }' }
    },
    {
      tableName: 'console_user_profile',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      comment: '后台管理的用户个人资料'
    }
  );

  return ConsoleUserProfile;
};

export default defineConsoleUserProfile;
