export default (sequelize, DataTypes) => {
  const SsoLog = sequelize.define(
    'SsoLog',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      uid: {
        type: DataTypes.INTEGER,
        comment: '用户ID'
      },
      event: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '事件类型: LOGIN, EXCHANGE, REGISTER, KICK'
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
        comment: '详情 JSON'
      }
    },
    {
      tableName: 'sso_logs',
      timestamps: true,
      updatedAt: false // 日志表不需要更新时间
    }
  );

  return SsoLog;
};
