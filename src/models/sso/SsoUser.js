export default (sequelize, DataTypes) => {
  const SsoUser = sequelize.define(
    'SsoUser',
    {
      uid: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: false,
        comment: '关联 User 表的 uid'
      },
      last_login_at: {
        type: DataTypes.DATE,
        comment: '最后登录时间'
      },
      last_login_ip: {
        type: DataTypes.STRING(50),
        comment: '最后登录IP'
      },
      last_login_app: {
        type: DataTypes.STRING(50),
        comment: '最后登录的应用ID'
      }
    },
    {
      tableName: 'sso_user_traces',
      timestamps: true,
      comment: 'SSO用户登录痕迹表'
    }
  );

  SsoUser.associate = (models) => {
    // 反向关联 User
    SsoUser.belongsTo(models.User, {
      foreignKey: 'uid',
      as: 'profile'
    });
    // 一个用户可以有多个应用会话
    SsoUser.hasMany(models.SsoSession, {
      foreignKey: 'uid',
      sourceKey: 'uid',
      as: 'sessions'
    });
  };

  return SsoUser;
};
