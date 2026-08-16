/**
 * 给 posecraft_work 和 posecraft_template 添加地址字段
 * 发布地址（自动采集）+ 作品地址（EXIF GPS 或手动选择）
 */
export async function up({ queryInterface, Sequelize }) {
  // ── posecraft_work ──
  await queryInterface.addColumn('posecraft_work', 'publication_address', {
    type: Sequelize.STRING(500),
    comment: '发布地址文本'
  });
  await queryInterface.addColumn('posecraft_work', 'publication_lat', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '发布地址纬度'
  });
  await queryInterface.addColumn('posecraft_work', 'publication_lng', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '发布地址经度'
  });
  await queryInterface.addColumn('posecraft_work', 'publication_source', {
    type: Sequelize.ENUM('gps', 'ip'),
    comment: '发布地址来源'
  });
  await queryInterface.addColumn('posecraft_work', 'work_address', {
    type: Sequelize.STRING(500),
    comment: '作品地址文本'
  });
  await queryInterface.addColumn('posecraft_work', 'work_lat', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '作品地址纬度'
  });
  await queryInterface.addColumn('posecraft_work', 'work_lng', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '作品地址经度'
  });
  await queryInterface.addColumn('posecraft_work', 'work_address_source', {
    type: Sequelize.ENUM('exif', 'manual'),
    comment: '作品地址来源'
  });

  // ── posecraft_template ──
  await queryInterface.addColumn('posecraft_template', 'publication_address', {
    type: Sequelize.STRING(500),
    comment: '发布地址文本'
  });
  await queryInterface.addColumn('posecraft_template', 'publication_lat', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '发布地址纬度'
  });
  await queryInterface.addColumn('posecraft_template', 'publication_lng', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '发布地址经度'
  });
  await queryInterface.addColumn('posecraft_template', 'publication_source', {
    type: Sequelize.ENUM('gps', 'ip'),
    comment: '发布地址来源'
  });
  await queryInterface.addColumn('posecraft_template', 'work_address', {
    type: Sequelize.STRING(500),
    comment: '作品地址文本'
  });
  await queryInterface.addColumn('posecraft_template', 'work_lat', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '作品地址纬度'
  });
  await queryInterface.addColumn('posecraft_template', 'work_lng', {
    type: Sequelize.DECIMAL(10, 7),
    comment: '作品地址经度'
  });
  await queryInterface.addColumn('posecraft_template', 'work_address_source', {
    type: Sequelize.ENUM('exif', 'manual'),
    comment: '作品地址来源'
  });
}

export async function down({ queryInterface }) {
  const fields = [
    'publication_address',
    'publication_lat',
    'publication_lng',
    'publication_source',
    'work_address',
    'work_lat',
    'work_lng',
    'work_address_source'
  ];
  for (const f of fields) {
    await queryInterface.removeColumn('posecraft_work', f);
    await queryInterface.removeColumn('posecraft_template', f);
  }
}
