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
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '所属应用ID'
      },
      device_id: {
        type: DataTypes.STRING(100),
        comment: '设备唯一标识 (用于多端互踢)'
      },
      /**
       * 凭证唯一标识符 (jti / SHA-256 哈希值)
       * 安全加固：不存储明文的无状态 JWT，防止数据库泄露导致免检令牌直接曝光。
       * 存储 JWT 的唯一标识符 (jti) 或其 SHA-256 哈希值，用于吊销、黑名单比对或单端单点登录拦截。
       */
      token: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '凭证唯一标识符 (存储 JWT 的 jti 或 SHA-256 签名值，防明文泄露)'
      },
      ip: {
        type: DataTypes.STRING(50)
      },
      location: {
        type: DataTypes.STRING(255)
      },
      user_agent: {
        type: DataTypes.TEXT
      },
      last_active: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      revoked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否已吊销'
      }
    },
    {
      tableName: 'session_tokens',
      timestamps: true,
      indexes: [
        { fields: ['user_id'] }, 
        { fields: ['app_id'] }, 
        { fields: ['device_id'] },
        { fields: ['token'], name: 'idx_session_token_identifier' }, // 增加索引，以便黑名单/吊销查询时实现 O(1) 速度
        { fields: ['user_id', 'app_id', 'device_id'], name: 'idx_user_app_device' } // 高频：多端互踢查询
      ]
    }
  );

  SessionToken.associate = (models) => {
    SessionToken.belongsTo(models.UserSession, {
      foreignKey: 'user_id',
      targetKey: 'user_id',
      as: 'globalSession',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    // 关联 User 表，用于 session 回退查询时加载用户信息
    SessionToken.belongsTo(models.User, {
      foreignKey: 'user_id',
      targetKey: 'id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return SessionToken;
};
