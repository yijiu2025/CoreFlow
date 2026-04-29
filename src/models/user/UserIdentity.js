/**
 * 用户安全凭证模型 (密码/三方登录)
 */
export default (sequelize, DataTypes) => {
  const UserIdentity = sequelize.define(
    'UserIdentity',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      uid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联 users 表的 uid'
      },
      identity_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'PASSWORD',
        comment: '标识类型: PASSWORD, WECHAT, GITHUB'
      },
      identifier: {
        type: DataTypes.STRING(100),
        comment: '识别码 (用户名, 邮箱, 手机号 或 第三方唯一ID)'
      },
      credential: {
        type: DataTypes.STRING(128),
        comment: '凭证 (密码哈希值)'
      }
    },
    {
      tableName: 'user_identities',
      timestamps: true,
      comment: '用户安全凭证表'
    }
  );

  UserIdentity.associate = (models) => {
    UserIdentity.belongsTo(models.User, {
      foreignKey: 'uid',
      as: 'user'
    });
  };

  return UserIdentity;
};
