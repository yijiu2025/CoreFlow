/**
 * 工业级用户基础信息模型 (User Profile)
 */
export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '内部系统主键 (专用于底层连表，绝不对外暴露)'
      },
      uid: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
        allowNull: false,
        comment: '对外的全局唯一标识 (API 参数、Token Payload)'
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '用户显示昵称/花名'
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: { isEmail: true },
        unique: true,
        comment: '联系邮箱 (仅用于通知或展示)'
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '联系手机号 (仅用于通知或展示)'
      },
      avatar: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '头像链接'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1:正常, 0:封禁/冻结, -1:已注销'
      }
    },
    {
      tableName: 'user_user', // 建议表名使用下划线而不是中划线
      timestamps: true,
      paranoid: true, // 开启软删除
      comment: '用户基础信息表 (不包含任何认证敏感数据)',
      indexes: [
        {
          fields: ['uid'],
          name: 'idx_uid'
        }
      ]
    }
  );

  User.associate = (models) => {
    // 1:N 关联多源身份凭证表 (密码、微信、手机验证码等)
    User.hasMany(models.UserIdentity, {
      foreignKey: 'user_id',
      as: 'identities'
    });

    // 1:1 关联全局会话追踪 (跨应用大盘)
    User.hasOne(models.UserSession, {
      foreignKey: 'user_id',
      as: 'globalSession'
    });

    // N:N 多对多关联角色 (RBAC/PBAC)
    User.belongsToMany(models.Role, {
      through: models.UserRole,
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'roles'
    });

    // 1:N 一对多关联内联策略 (PBAC 勾选特权/黑名单)
    User.hasMany(models.InlinePolicy, {
      foreignKey: 'user_id',
      as: 'inlinePolicies'
    });
  };

  return User;
};
