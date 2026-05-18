export default (sequelize, DataTypes) => {
  const SessionToken = sequelize.define(
    'SessionToken',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '用户内部ID'
      },
      app_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '所属应用ID'
      },
      device_id: {
        type: DataTypes.STRING(100),
        comment: '设备唯一标识 (用于多端互踢)'
      },
      token: {
        type: DataTypes.TEXT,
        comment: '本次登录发放的身份凭证(如 JWT)'
      },
      ip: {
        type: DataTypes.STRING(50)
      },
      location: {
        type: DataTypes.STRING
      },
      user_agent: {
        type: DataTypes.TEXT
      },
      last_active: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: 'sys_session_tokens',
      timestamps: true,
      indexes: [{ fields: ['user_id'] }, { fields: ['app_id'] }, { fields: ['device_id'] }]
    }
  );

  SessionToken.associate = (models) => {
    SessionToken.belongsTo(models.UserSession, {
      foreignKey: 'user_id',
      targetKey: 'user_id',
      as: 'globalSession'
    });
  };

  return SessionToken;
};
