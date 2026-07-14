/**
 * PoseCraft Banner 配置模型
 * 存储首页推荐大图 Banner 的可配置内容（标题/描述/背景图/开关/定时展示）
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} BannerConfig 模型
 */
export default (sequelize, DataTypes) => {
  const BannerConfig = sequelize.define(
    'BannerConfig',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'Banner 大标题'
      },
      description: {
        type: DataTypes.TEXT,
        comment: 'Banner 描述文本'
      },
      badge_text: {
        type: DataTypes.STRING(50),
        field: 'badge_text',
        comment: '徽章文案'
      },
      button_text: {
        type: DataTypes.STRING(50),
        field: 'button_text',
        comment: '按钮文案'
      },
      image_url: {
        type: DataTypes.STRING(500),
        field: 'image_url',
        comment: '背景图 URL'
      },
      link_url: {
        type: DataTypes.STRING(500),
        field: 'link_url',
        comment: '按钮跳转 URL'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
        comment: '排序权重（未来多 Banner 轮播）'
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'enabled',
        comment: '是否启用'
      },
      start_at: {
        type: DataTypes.DATE,
        field: 'start_at',
        comment: '展示开始时间（NULL=不限）'
      },
      end_at: {
        type: DataTypes.DATE,
        field: 'end_at',
        comment: '展示结束时间（NULL=不限）'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_banner_config',
      timestamps: true,
      indexes: [
        { fields: ['enabled'], name: 'idx_banner_enabled' },
        { fields: ['sort_order'], name: 'idx_banner_sort' }
      ],
      comment: 'PoseCraft 首页 Banner 配置'
    }
  );

  return BannerConfig;
};
