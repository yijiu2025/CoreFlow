export default (sequelize, DataTypes) => {
  const UserSession = sequelize.define(
    'UserSession',
    {
      user_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: false,
        comment: '关联 User.id'
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
      tableName: 'sys_user_session',
      timestamps: true,
      comment: '用户全局会话主表 (追踪跨应用活跃状态)'
    }
  );

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'profile'
    });
    UserSession.hasMany(models.SessionToken, {
      foreignKey: 'user_id',
      sourceKey: 'user_id',
      as: 'tokens'
    });
  };

  return UserSession;
};
