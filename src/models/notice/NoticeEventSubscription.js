/**
 * 通知事件订阅模型（全局默认）
 *
 * 语义是「没做过个人设置的人，默认收哪些」：投递时先看个人偏好，个人没配过才落到
 * 这里；这里也没有，才落到事件常量里的 `defaultChannels`。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
const defineNoticeEventSubscription = (sequelize, DataTypes) => {
  const NoticeEventSubscription = sequelize.define(
    'NoticeEventSubscription',
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
        comment: '事件 code，取值见 app/notice/constants.js'
      },
      channel: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '渠道 id'
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '该事件的该渠道是否默认开启'
      }
    },
    {
      tableName: 'notice_event_subscriptions',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          // 索引字段用**属性名**：Sequelize 会按 underscored 映射成 event_code，
          // 直接写列名在 sync 时会被当成"不存在的属性"
          fields: ['eventCode', 'channel'],
          unique: true,
          name: 'uk_notice_event_subscriptions_event_channel'
        }
      ]
    }
  );

  return NoticeEventSubscription;
};

export default defineNoticeEventSubscription;
