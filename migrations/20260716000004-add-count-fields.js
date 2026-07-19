/**
 * 给 posecraft_work 和 posecraft_template 添加预留计数字段
 * collects_count / shares_count / comments_count
 */
export async function up({ queryInterface, Sequelize }) {
  // ── posecraft_work ──
  await queryInterface.addColumn('posecraft_work', 'collects_count', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    comment: '收藏数（预留）'
  })
  await queryInterface.addColumn('posecraft_work', 'shares_count', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    comment: '分享数（预留）'
  })
  await queryInterface.addColumn('posecraft_work', 'comments_count', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    comment: '评论数（预留）'
  })

  // ── posecraft_template ──
  await queryInterface.addColumn('posecraft_template', 'collects_count', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    comment: '收藏数（预留）'
  })
  await queryInterface.addColumn('posecraft_template', 'shares_count', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    comment: '分享数（预留）'
  })
  await queryInterface.addColumn('posecraft_template', 'comments_count', {
    type: Sequelize.INTEGER,
    defaultValue: 0,
    comment: '评论数（预留）'
  })
}

export async function down({ queryInterface }) {
  const fields = ['collects_count', 'shares_count', 'comments_count']
  for (const f of fields) {
    await queryInterface.removeColumn('posecraft_work', f)
    await queryInterface.removeColumn('posecraft_template', f)
  }
}
