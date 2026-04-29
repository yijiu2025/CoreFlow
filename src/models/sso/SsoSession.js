export default (sequelize, DataTypes) => {
  const SsoSession = sequelize.define(
    'SsoSession',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      uid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID'
      },
      app_id: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '所属应用ID'
      },
      device_id: {
        type: DataTypes.STRING(100),
        comment: '设备唯一标识'
      },
      token: {
        type: DataTypes.TEXT,
        comment: '本次登录使用的Token'
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
      tableName: 'sso_sessions',
      timestamps: true,
      indexes: [{ fields: ['uid'] }, { fields: ['app_id'] }, { fields: ['device_id'] }]
    }
  );

  SsoSession.associate = (models) => {
    SsoSession.belongsTo(models.SsoUser, {
      foreignKey: 'uid',
      targetKey: 'uid',
      as: 'user'
    });
  };

  return SsoSession;
};
