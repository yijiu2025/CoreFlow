/**
 * 通知模板模型
 *
 * 一行 = 一个「事件 × 渠道」的模板。约定 `code` 直接复用事件 code（如 `user.created`），
 * 投递时按 (code, channel) 取启用中的那一条 —— 管理页因此不需要再维护"模板绑哪个事件"。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
const defineNoticeTemplate = (sequelize, DataTypes) => {
  const NoticeTemplate = sequelize.define(
    'NoticeTemplate',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '主键自增 ID'
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '模板编码（约定与事件 code 一致）'
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '模板名称（管理页展示）'
      },
      channel: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '渠道 id，取值见 app/notice/constants.js'
      },
      subject: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '标题（邮件主题；其他渠道可留空）'
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '正文模板，变量写作 {{name}}'
      },
      variables: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '声明过的变量名数组，用于校验正文里的占位符'
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用（停用后投递会回落到兜底正文）'
      }
    },
    {
      tableName: 'notice_templates',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['code'], unique: true, name: 'uk_notice_templates_code' },
        { fields: ['channel'], name: 'idx_notice_templates_channel' }
      ]
    }
  );

  return NoticeTemplate;
};

export default defineNoticeTemplate;
