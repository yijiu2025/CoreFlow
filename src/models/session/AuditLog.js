/**
 * 安全审计日志模型
 * 记录关键安全事件：登录/登出/权限变更/密码修改/踢出设备
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
const defineAuditLog = (sequelize, DataTypes) => {
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
      // 复合索引替换两个单列索引（全部查询场景都带 created_at 排序/过滤），
      // 与迁移 20260919000001 对应，索引总数不增
      indexes: [
        { fields: ['ip'] },
        { fields: ['created_at'] },
        { fields: ['event', 'created_at'], name: 'audit_logs_event_created' },
        { fields: ['user_id', 'created_at'], name: 'audit_logs_user_id_created' }
      ],
      comment: '安全审计日志表'
    }
  );

  return AuditLog;
};

export default defineAuditLog;
