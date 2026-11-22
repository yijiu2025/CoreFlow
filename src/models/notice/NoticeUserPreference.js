/**
 * 通知个人偏好模型
 *
 * 一行 = 某用户对「事件 × 渠道」的选择。**行不存在 ≠ 关闭**：不存在表示"跟随全局"，
 * 由投递逻辑回落到全局订阅/事件默认渠道。写 false 才是显式关闭。
 * 这条区别是本次需求的底线（"未设置"不能被当成"不要"），字段上也因此没有默认值兜底。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
const defineNoticeUserPreference = (sequelize, DataTypes) => {
  const NoticeUserPreference = sequelize.define(
    'NoticeUserPreference',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键自增 ID'
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id',
        comment: '用户数字主键（不是对外 uid）'
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
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否接收'
      },
      quietFrom: {
        type: DataTypes.TIME,
        allowNull: true,
        field: 'quiet_from',
        comment: '免打扰开始时间（含），空表示不限制'
      },
      quietTo: {
        type: DataTypes.TIME,
        allowNull: true,
        field: 'quiet_to',
        comment: '免打扰结束时间（不含），可小于开始时间表示跨天'
      }
    },
    {
      tableName: 'notice_user_preferences',
      timestamps: true,
      underscored: true,
      indexes: [
        {
          // 索引字段用属性名（underscored 负责映射到列名）
          fields: ['userId', 'eventCode', 'channel'],
          unique: true,
          name: 'uk_notice_user_preferences_user_event_channel'
        }
      ]
    }
  );

  return NoticeUserPreference;
};

export default defineNoticeUserPreference;
