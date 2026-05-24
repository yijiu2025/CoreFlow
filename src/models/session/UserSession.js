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
        type: DataTypes.STRING(64), // 统一对齐：长度修改为 64 保持 app_id 规范一致
        comment: '最后登录的应用ID'
      },
      /**
       * 最后活跃时间
       * 性能加固：方便系统快速判定用户是否在线（通常结合一个心跳阈值如 15 分钟），
       * 避免为了获取在线状态而高频执行 JOIN session_tokens 大表的复杂联表动作。
       */
      last_active_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '最后活跃时间 (在线状态心跳指标)'
      }
    },
    {
      tableName: 'session_user_session',
      timestamps: true,
      comment: '用户全局会话主表 (追踪跨应用活跃状态)'
    }
  );

  UserSession.associate = (models) => {
    UserSession.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'profile',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    UserSession.hasMany(models.SessionToken, {
      foreignKey: 'user_id',
      sourceKey: 'user_id',
      as: 'tokens',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      hooks: true
    });
  };

  return UserSession;
};
