/**
 * 创建 posecraft_banner_config 表
 * 存储首页推荐大图 Banner 配置（标题/描述/Badge/按钮/背景图/开关/定时展示）
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('posecraft_banner_config', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: Sequelize.STRING(200),
      allowNull: false,
      comment: 'Banner 大标题'
    },
    description: {
      type: Sequelize.TEXT,
      comment: 'Banner 描述文本'
    },
    badge_text: {
      type: Sequelize.STRING(50),
      comment: '徽章文案'
    },
    button_text: {
      type: Sequelize.STRING(50),
      comment: '按钮文案'
    },
    image_url: {
      type: Sequelize.STRING(500),
      comment: '背景图 URL'
    },
    link_url: {
      type: Sequelize.STRING(500),
      comment: '按钮跳转 URL'
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

  await queryInterface.addIndex('posecraft_banner_config', ['enabled'], { name: 'idx_banner_enabled' });
  await queryInterface.addIndex('posecraft_banner_config', ['sort_order'], { name: 'idx_banner_sort' });

  // Seed：把当前硬编码的 Banner 内容搬进来，避免上线空白
  await queryInterface.bulkInsert('posecraft_banner_config', [
    {
      title: '今日精选 · 100+ 优质姿势模板',
      description: '编辑团队精心挑选，涵盖人像、风光、创意等多个领域',
      badge_text: '每日精选',
      button_text: '立即探索',
      image_url: '/posecraft/logo.svg',
      link_url: '',
      sort_order: 0,
      enabled: true,
      start_at: null,
      end_at: null,
      delete_version: 0,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('posecraft_banner_config');
}
