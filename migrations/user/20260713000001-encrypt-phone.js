import { createLogger, logStdout } from '../../src/framework/log/index.js';

const log = createLogger('migrations.user.20260713000001-encrypt-phone');
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
    logStdout('  ℹ️  无明文手机号需要加密');
    return;
  }

  // 动态加载模型和加密函数（需要 process.env.PHONE_ENCRYPT_KEY 已配置）
  // 🔴 路径修正：迁移文件位于 migrations/user/ 下，必须用 ../../src 才能指到仓库根的 src/；
  // 此前 '../src/...' 会解析到不存在的 migrations/src/，且 src/db/index.js 也不存在（实为 src/framework/db/）。
  // sequelize 实例直接用迁移框架注入的 queryInterface.sequelize，无需再 import db。
  const { default: UserDefine } = await import('../../src/models/user/User.js');
  const User = UserDefine(queryInterface.sequelize, Sequelize);

  let count = 0;
  const failed = [];
  for (const row of rows) {
    try {
      const encrypted = User.encryptPhoneStatic(row.phone);
      await queryInterface.sequelize.query(`UPDATE user_user SET phone = :phone WHERE id = :id`, {
        replacements: { phone: encrypted, id: row.id }
      });
      count++;
    } catch (err) {
      failed.push({ id: row.id, message: err.message });
      log.warn(`  ⚠️  加密失败 id=${row.id}: ${err.message}`);
    }
  }

  // 任何单行失败都必须使迁移失败，不能报告"已加密 N/总数"后仍标记成功
  if (failed.length > 0) {
    const first = failed[0];
    throw new Error(
      `手机号加密迁移失败：${failed.length} 条记录加密失败（示例 id=${first.id}: ${first.message}），请排查后重跑`
    );
  }

  logStdout(`  ✅ 已加密 ${count}/${rows.length} 条手机号记录`);
}

export async function down({ queryInterface }) {
  // 注意：AES 加密不可逆，down 无法恢复明文，仅作占位
  log.warn('  ⚠️  手机号加密不可逆，down 迁移无法恢复明文（需备份）');
}
