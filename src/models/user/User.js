/**
 * 用户基础信息模型
 */
export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      uid: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '用户唯一标识'
      },
      username: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '用户名'
      },
      nickname: {
        type: DataTypes.STRING(50),
        comment: '昵称'
      },
      email: {
        type: DataTypes.STRING(100),
        unique: true,
        validate: { isEmail: true },
        comment: '邮箱'
      },
      phone: {
        type: DataTypes.STRING(20),
        unique: true,
        comment: '手机号'
      },
      avatar: {
        type: DataTypes.STRING(255),
        comment: '头像链接'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1:可用, 0:禁用'
      }
    },
    {
      tableName: 'users',
      timestamps: true,
      comment: '用户基础信息表'
    }
  );

  User.associate = (models) => {
    // 1:1 关联身份密码表
    User.hasOne(models.UserIdentity, {
      foreignKey: 'uid',
      as: 'identity'
    });
    // 关联 SSO 追踪
    User.hasOne(models.SsoUser, {
      foreignKey: 'uid',
      as: 'ssoInfo'
    });
    // 多对多关联分组
    User.belongsToMany(models.Group, {
      through: models.UserGroup,
      foreignKey: 'uid',
      otherKey: 'group_id',
      as: 'groups'
    });
  };

  return User;
};
