/**
 * 批量加密 user_user 表中现有的明文手机号
 * 加密后格式: base64(IV):base64(ciphertext)（含冒号分隔符）
 */
export async function up({ queryInterface, Sequelize }) {
  // 查所有 phone 不为空且不含冒号的记录（即明文格式）
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, phone FROM user_user WHERE phone IS NOT NULL AND phone NOT LIKE '%:%'`
  );

  if (rows.length === 0) {
    console.log('  ℹ️  无明文手机号需要加密');
    return;
  }

  // 动态加载模型和加密函数（需要 process.env.PHONE_ENCRYPT_KEY 已配置）
  const { default: UserDefine } = await import('../src/models/user/User.js');
  const { sequelize } = await import('../src/db/index.js');
  const User = UserDefine(sequelize, Sequelize);

  let count = 0;
  for (const row of rows) {
    try {
      const encrypted = User.encryptPhoneStatic(row.phone);
      await queryInterface.sequelize.query(`UPDATE user_user SET phone = :phone WHERE id = :id`, {
        replacements: { phone: encrypted, id: row.id }
      });
      count++;
    } catch (err) {
      console.warn(`  ⚠️  加密失败 id=${row.id}: ${err.message}`);
    }
  }

  console.log(`  ✅ 已加密 ${count}/${rows.length} 条手机号记录`);
}

export async function down({ queryInterface }) {
  // 注意：AES 加密不可逆，down 无法恢复明文，仅作占位
  console.warn('  ⚠️  手机号加密不可逆，down 迁移无法恢复明文（需备份）');
}
