/**
 * PoseCraft 表迁移
 * 创建模板表、作品表、分析记录表
 */
export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  // 模板表
  await createTableIfNotExists('posecraft_template', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    title: { type: Sequelize.STRING(200), allowNull: false },
    description: { type: Sequelize.TEXT },
    category: { type: Sequelize.STRING(50), defaultValue: 'general' },
    thumbnail_url: { type: Sequelize.STRING(500) },
    image_url: { type: Sequelize.STRING(500) },
    pose_data: { type: Sequelize.JSON },
    tags: { type: Sequelize.JSON },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    status: { type: Sequelize.TINYINT, defaultValue: 1 },
    likes_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    uses_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('posecraft_template', ['user_id'], { name: 'idx_template_user' });
  await addIndexIfNotExists('posecraft_template', ['category'], { name: 'idx_template_category' });
  await addIndexIfNotExists('posecraft_template', ['status'], { name: 'idx_template_status' });

  // 作品表
  await createTableIfNotExists('posecraft_work', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    template_id: { type: Sequelize.BIGINT },
    title: { type: Sequelize.STRING(200) },
    description: { type: Sequelize.TEXT },
    image_url: { type: Sequelize.STRING(500) },
    thumbnail_url: { type: Sequelize.STRING(500) },
    analysis_data: { type: Sequelize.JSON },
    edit_data: { type: Sequelize.JSON },
    status: { type: Sequelize.TINYINT, defaultValue: 1 },
    likes_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    views_count: { type: Sequelize.INTEGER, defaultValue: 0 },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('posecraft_work', ['user_id'], { name: 'idx_work_user' });
  await addIndexIfNotExists('posecraft_work', ['template_id'], { name: 'idx_work_template' });
  await addIndexIfNotExists('posecraft_work', ['status'], { name: 'idx_work_status' });
  await addIndexIfNotExists('posecraft_work', ['created_at'], { name: 'idx_work_created' });

  // 分析记录表
  await createTableIfNotExists('posecraft_analysis', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    image_url: { type: Sequelize.STRING(500) },
    analysis_type: { type: Sequelize.STRING(50), allowNull: false },
    result_data: { type: Sequelize.JSON },
    processing_time: { type: Sequelize.INTEGER },
    status: { type: Sequelize.TINYINT, defaultValue: 1 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('posecraft_analysis', ['user_id'], { name: 'idx_analysis_user' });
  await addIndexIfNotExists('posecraft_analysis', ['analysis_type'], { name: 'idx_analysis_type' });
  await addIndexIfNotExists('posecraft_analysis', ['created_at'], { name: 'idx_analysis_created' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('posecraft_analysis');
  await queryInterface.dropTable('posecraft_work');
  await queryInterface.dropTable('posecraft_template');
}
