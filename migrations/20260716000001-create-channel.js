/**
 * 创建 posecraft_channel 表
 * 存储首页频道 Tab 配置（名称/图标/类型/目标路由/分类/排序/定时展示）
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('posecraft_channel', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    value: {
      type: Sequelize.STRING(50),
      allowNull: false,
      unique: true,
      comment: '频道标识'
    },
    label: {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '显示名称'
    },
    icon: {
      type: Sequelize.STRING(500),
      comment: '图标类名或 emoji'
    },
    type: {
      type: Sequelize.ENUM('content', 'iframe', 'route', 'external'),
      defaultValue: 'content',
      comment: '频道类型'
    },
    url: {
      type: Sequelize.STRING(1000),
      comment: '外部 URL 或 iframe src'
    },
    route: {
      type: Sequelize.STRING(200),
      comment: 'SPA 目标路由'
    },
    category: {
      type: Sequelize.STRING(50),
      comment: '关联作品分类'
    },
    has_banner: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: '是否展示 Banner'
    },
    sort_order: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: '排序权重'
    },
    enabled: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      comment: '是否启用'
    },
    start_at: {
      type: Sequelize.DATE,
      comment: '展示开始时间'
    },
    end_at: {
      type: Sequelize.DATE,
      comment: '展示结束时间'
    },
    delete_version: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await queryInterface.addIndex('posecraft_channel', ['enabled'], { name: 'idx_channel_enabled' });
  await queryInterface.addIndex('posecraft_channel', ['sort_order'], { name: 'idx_channel_sort' });
  await queryInterface.addIndex('posecraft_channel', ['value'], { name: 'idx_channel_value' });

  // Seed：把当前硬编码的 7 个频道搬进数据库（icon 使用 emoji，前端直接渲染）
  await queryInterface.bulkInsert('posecraft_channel', [
    {
      value: 'recommend', label: '推荐', icon: '🔥', type: 'content',
      url: null, route: null, category: null, has_banner: true,
      sort_order: 100, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    },
    {
      value: 'pose', label: '姿势', icon: '👤', type: 'content',
      url: null, route: null, category: 'pose', has_banner: false,
      sort_order: 90, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    },
    {
      value: 'creative', label: '创意', icon: '💡', type: 'content',
      url: null, route: null, category: 'creative', has_banner: false,
      sort_order: 80, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    },
    {
      value: 'scenery', label: '风景', icon: '📷', type: 'iframe',
      url: 'https://cn.bing.com/images/search?q=%E9%A3%8E%E6%99%AF', route: null, category: null, has_banner: false,
      sort_order: 70, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    },
    {
      value: 'sports', label: '运动', icon: '🏆', type: 'content',
      url: null, route: null, category: 'sports', has_banner: false,
      sort_order: 60, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    },
    {
      value: 'composition', label: '构图', icon: '📐', type: 'content',
      url: null, route: null, category: 'composition', has_banner: false,
      sort_order: 50, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    },
    {
      value: 'technique', label: '技巧', icon: '🔧', type: 'content',
      url: null, route: null, category: 'technique', has_banner: false,
      sort_order: 40, enabled: true, start_at: null, end_at: null,
      delete_version: 0, created_at: new Date(), updated_at: new Date()
    }
  ]);
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('posecraft_channel');
}
