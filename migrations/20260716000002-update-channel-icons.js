/**
 * 更新频道图标为 emoji（替代旧版 Ant Design 图标类名）
 */
export async function up({ queryInterface }) {
  const iconMap = {
    recommend: '🔥',
    pose: '👤',
    creative: '💡',
    scenery: '📷',
    sports: '🏆',
    composition: '📐',
    technique: '🔧'
  }
  for (const [value, icon] of Object.entries(iconMap)) {
    await queryInterface.sequelize.query(
      `UPDATE posecraft_channel SET icon = :icon WHERE value = :value AND delete_version = 0`,
      { replacements: { icon, value } }
    )
  }
}

export async function down({ queryInterface }) {
  // 回滚：恢复为 Ant Design 类名（不影响功能，仅记录用途）
  const iconMap = {
    recommend: 'FireOutlined',
    pose: 'UserOutlined',
    creative: 'BulbOutlined',
    scenery: 'CameraOutlined',
    sports: 'TrophyOutlined',
    composition: 'AppstoreOutlined',
    technique: 'ToolOutlined'
  }
  for (const [value, icon] of Object.entries(iconMap)) {
    await queryInterface.sequelize.query(
      `UPDATE posecraft_channel SET icon = :icon WHERE value = :value AND delete_version = 0`,
      { replacements: { icon, value } }
    )
  }
}
