export default (sequelize, DataTypes) => {
  const SessionLog = sequelize.define(
    'SessionLog',
    {
      /** 
       * 自增主键 
       * 在分区表设计中，主键/唯一索引必须包含分区字段 (created_at)。
       * 因此将 id 与 created_at 设为联合主键 (Composite Primary Key)。
       */
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '自增主键'
      },
      created_at: {
        type: DataTypes.DATE,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at',
        comment: '创建时间 (物理分区依据字段)'
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
      createdAt: 'created_at', // 显式匹配字段名
      updatedAt: false,
      comment: '系统会话/审计日志表 (支持按月物理分区)'
    }
  );

  return SessionLog;
};
