/**
 * 为 posecraft_template 表添加 work_id 字段
 * 实现模板与底图作品的双向绑定：Template.work_id → Work.id
 *
 * 同时确保 thumbnail_url 字段存在（旧迁移已创建，此处做幂等补全）
 */
export async function up({ queryInterface, Sequelize }) {
  // 安全取列（模板表）
  const templateDesc = await queryInterface.describeTable('posecraft_template');
  const templateColumns = Object.keys(templateDesc);

  // 1. 添加 work_id 列（如果不存在）
  if (!templateColumns.includes('work_id')) {
    await queryInterface.addColumn('posecraft_template', 'work_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '该模板对应的底图作品 ID（一对一绑定）'
    });
  }

  // 2. 添加索引（幂等）
  try {
    await queryInterface.addIndex('posecraft_template', ['work_id'], { name: 'idx_template_work' });
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }

  // 3. 确保 thumbnail_url 列存在（旧迁移已创建，此处做幂等补全）
  if (!templateColumns.includes('thumbnail_url')) {
    await queryInterface.addColumn('posecraft_template', 'thumbnail_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: '骨架预览图 URL（透明背景 PNG），后端生成'
    });
  }

  // 安全取列（作品表）
  const workDesc = await queryInterface.describeTable('posecraft_work');
  const workColumns = Object.keys(workDesc);

  // 4. 添加 is_template_work 列（如果不存在）
  if (!workColumns.includes('is_template_work')) {
    await queryInterface.addColumn('posecraft_work', 'is_template_work', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否为模板底图作品，true 时前端显示「模板」徽章'
    });
  }

  // 5. 给 is_template_work 加索引
  try {
    await queryInterface.addIndex('posecraft_work', ['is_template_work'], { name: 'idx_work_is_template' });
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

export async function down({ queryInterface }) {
  const templateDesc = await queryInterface.describeTable('posecraft_template');
  const templateColumns = Object.keys(templateDesc);

  if (templateColumns.includes('thumbnail_url')) {
    await queryInterface.removeColumn('posecraft_template', 'thumbnail_url');
  }
  if (templateColumns.includes('work_id')) {
    await queryInterface.removeColumn('posecraft_template', 'work_id');
  }

  const workDesc = await queryInterface.describeTable('posecraft_work');
  const workColumns = Object.keys(workDesc);

  if (workColumns.includes('is_template_work')) {
    await queryInterface.removeColumn('posecraft_work', 'is_template_work');
  }
}
