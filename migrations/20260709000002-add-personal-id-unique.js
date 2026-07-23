/**
 * user_user.personal_id 加唯一索引 + 修复旧数据（dy14a27nhlbkd → 新格式）
 */
export async function up({ queryInterface, Sequelize }) {
  const tableName = 'user_user';

  // 1. 修复旧数据：将硬编码 personal_id 替换为唯一新格式
  const [users] = await queryInterface.sequelize.query(
    `SELECT id, personal_id FROM ${tableName} WHERE personal_id = 'dy14a27nhlbkd'`
  );
  for (const u of users) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const newId = `pose_craft_${suffix}`;
    // 确保不与其他记录冲突
    const [dup] = await queryInterface.sequelize.query(`SELECT id FROM ${tableName} WHERE personal_id = '${newId}'`);
    if (dup.length === 0) {
      await queryInterface.sequelize.query(`UPDATE ${tableName} SET personal_id = '${newId}' WHERE id = ${u.id}`);
    }
  }

  // 2. 加唯一索引（幂等）
  try {
    await queryInterface.addIndex(tableName, ['personal_id'], {
      unique: true,
      name: 'uk_user_personal_id'
    });
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

export async function down({ queryInterface }) {
  try {
    await queryInterface.removeIndex('user_user', 'uk_user_personal_id');
  } catch {
    // 忽略不存在的索引
  }
}
