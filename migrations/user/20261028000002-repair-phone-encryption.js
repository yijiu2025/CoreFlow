/**
 * 补偿迁移：修复历史环境中"先加密后加宽"导致的手机号密文写入失败
 *
 * 历史顺序缺陷：加密迁移（20260713000001）在列加宽（20261028000001）之前执行，
 * 部分环境中密文无法写入 VARCHAR(20)，逐行失败被吞，最终仍标记成功。
 *
 * 本迁移在加宽完成后执行：重新扫描仍为明文的手机号并加密，任何单行失败都使迁移失败。
 */
import { createLogger, logStdout } from '../../src/framework/log/index.js';

const log = createLogger('migrations.user.20261028000002-repair-phone-encryption');

export async function up({ queryInterface, Sequelize }) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, phone FROM user_user WHERE phone IS NOT NULL AND phone NOT LIKE '%:%'`
  );

  if (!rows || rows.length === 0) {
    logStdout('  ℹ️  无遗留明文手机号，无需补偿加密');
    return;
  }

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
      log.warn(`  ⚠️  补偿加密失败 id=${row.id}: ${err.message}`);
    }
  }

  if (failed.length > 0) {
    const first = failed[0];
    throw new Error(
      `手机号补偿加密失败：${failed.length} 条记录加密失败（示例 id=${first.id}: ${first.message}），请排查后重跑`
    );
  }

  logStdout(`  ✅ 已补偿加密 ${count}/${rows.length} 条手机号记录`);
}

export async function down() {
  log.warn('  ⚠️  手机号加密不可逆，down 无法恢复明文（需备份与密钥）');
}
