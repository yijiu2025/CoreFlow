/**
 * 给 posecraft_work 添加 category 字段（用于频道分类筛选）
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('posecraft_work', 'category', {
    type: Sequelize.STRING(50),
    defaultValue: 'pose',
    comment: '作品分类: pose, creative, sports, composition, technique, custom'
  });
  await queryInterface.addIndex('posecraft_work', ['category'], { name: 'idx_work_category' });
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('posecraft_work', 'category');
}
