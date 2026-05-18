export default (sequelize, DataTypes) => {
  const SessionLog = sequelize.define(
    'SessionLog',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '用户内部ID (若登录失败可能无UID)'
      },
      event: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '事件类型: LOGIN, LOGOUT, KICK, FORBIDDEN'
      },
      app_id: {
        type: DataTypes.STRING(50),
        comment: '关联应用ID'
      },
      ip: {
        type: DataTypes.STRING(50)
      },
      location: {
        type: DataTypes.STRING(100)
      },
      user_agent: {
        type: DataTypes.TEXT
      },
      details: {
        type: DataTypes.JSON,
        comment: '详情 JSON (例如失败原因)'
      }
    },
    {
      tableName: 'sys_session_logs',
      timestamps: true,
      updatedAt: false // 日志表不需要更新时间
    }
  );

  return SessionLog;
};
