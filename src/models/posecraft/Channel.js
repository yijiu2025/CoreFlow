/**
 * PoseCraft 频道配置模型
 * 存储首页频道 Tab 的可配置内容（名称/图标/类型/目标路由/分类/排序/定时展示）
 *
 * @author Claude
 * @since 2026-07-16
 */
export default (sequelize, DataTypes) => {
  const Channel = sequelize.define(
    'Channel',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      value: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: '频道标识（recommend, pose, creative ...）'
      },
      label: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '显示名称'
      },
      icon: {
        type: DataTypes.STRING(500),
        comment: '图标类名或 emoji'
      },
      type: {
        type: DataTypes.ENUM('content', 'iframe', 'route', 'external'),
        defaultValue: 'content',
        comment: '频道类型：content=瀑布流 / iframe=内嵌 / route=SPA路由 / external=外部跳转'
      },
      url: {
        type: DataTypes.STRING(1000),
        comment: '外部 URL 或 iframe src'
      },
      route: {
        type: DataTypes.STRING(200),
        comment: 'SPA 目标路由（如 /explore?tab=scenery）'
      },
      category: {
        type: DataTypes.STRING(50),
        comment: '关联作品分类（content 类型专用，NULL=不筛选）'
      },
      has_banner: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否展示 Banner'
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重（越大越靠前）'
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '是否启用'
      },
      start_at: {
        type: DataTypes.DATE,
        comment: '展示开始时间（NULL=不限）'
      },
      end_at: {
        type: DataTypes.DATE,
        comment: '展示结束时间（NULL=不限）'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_channel',
      timestamps: true,
      indexes: [
        { fields: ['enabled'], name: 'idx_channel_enabled' },
        { fields: ['sort_order'], name: 'idx_channel_sort' },
        { fields: ['value'], name: 'idx_channel_value' }
      ],
      comment: 'PoseCraft 首页频道配置'
    }
  );

  return Channel;
};
