/**
 * 安全审计日志模型
 * 记录关键安全事件：登录/登出/权限变更/密码修改/踢出设备
 */
export default (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '关联用户 ID（登录失败时可能为空）'
      },
      event: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '事件类型: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGE, SESSION_KICK, PERMISSION_CHANGE'
      },
      app_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '应用标识'
      },
      ip: {
        type: DataTypes.STRING(50),
        comment: '客户端 IP'
      },
      user_agent: {
        type: DataTypes.TEXT,
        comment: 'User-Agent'
      },
      details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '事件详情（JSON）'
      }
    },
    {
      tableName: 'audit_logs',
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['event'] },
        { fields: ['created_at'] },
        { fields: ['ip'] }
      ],
      comment: '安全审计日志表'
    }
  );

  return AuditLog;
};
