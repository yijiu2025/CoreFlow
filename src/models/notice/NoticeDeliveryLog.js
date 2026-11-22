/**
 * 通知投递日志模型
 *
 * 只记结果不记正文：正文里可能含验证码/邮箱等敏感内容，落库等于多一处泄漏面。
 * `target` 是收件地址（邮箱等），失败时用于回答"到底发给谁失败了"。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
const defineNoticeDeliveryLog = (sequelize, DataTypes) => {
  const NoticeDeliveryLog = sequelize.define(
    'NoticeDeliveryLog',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键自增 ID'
      },
      eventCode: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'event_code',
        comment: '事件 code'
      },
      channel: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '渠道 id'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'user_id',
        comment: '接收人数字主键；系统级广播时为空'
      },
      target: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '收件地址（邮箱 / webhook 等）'
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        comment: 'sent | failed'
      },
      error: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '失败原因（成功时为空）'
      }
    },
    {
      tableName: 'notice_delivery_logs',
      timestamps: true,
      underscored: true,
      indexes: [
        // 索引字段用属性名（createdAt → created_at）
        { fields: ['createdAt'], name: 'idx_notice_delivery_logs_created_at' },
        { fields: ['status'], name: 'idx_notice_delivery_logs_status' }
      ]
    }
  );

  return NoticeDeliveryLog;
};

export default defineNoticeDeliveryLog;
