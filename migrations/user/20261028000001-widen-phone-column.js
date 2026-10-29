/**
 * 加宽 user_user.phone 列以容纳 AES 加密后的密文（历史迁移，保持幂等）
 *
 * 背景：
 *   加密迁移（20260713000001-encrypt-phone.js）把明文手机号改为
 *   base64(IV):base64(ciphertext):base64(hmac) 格式，长度约 200+ 字符；
 *   而原建表迁移把 phone 建为 STRING(20)，密文放不下（截断/Data too long）。
 *
 * 幂等：
 *   本迁移在部分环境中可能晚于加密执行（历史顺序缺陷），列可能已为 TEXT、
 *   索引可能已带前缀长度。为避免重复拆建索引/二次 change，先探测再操作。
 */
export async function up({ queryInterface, Sequelize }) {
  // 探测当前列类型：已是 TEXT 且唯一索引存在时直接跳过（幂等）
  const table = await queryInterface.describeTable('user_user');
  const phoneType = String(table?.phone?.type || '').toUpperCase();
  let hasPrefixIndex;
  try {
    const indexes = await queryInterface.showIndex('user_user');
    hasPrefixIndex = (indexes || []).some(
      idx => idx.name === 'uk_phone_delete_version' && Array.isArray(idx.fields)
    );
  } catch {
    hasPrefixIndex = false;
  }

  if (phoneType === 'TEXT' && hasPrefixIndex) {
    return;
  }

  if (phoneType !== 'TEXT') {
    try {
      await queryInterface.removeIndex('user_user', 'uk_phone_delete_version');
    } catch {
      // 索引可能本就不存在（已由其他迁移处理），忽略
    }
    await queryInterface.changeColumn('user_user', 'phone', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: '联系手机号（AES 加密后 base64:base64:base64）'
    });
  }

  // TEXT 唯一索引需指定前缀长度；用原生 SQL 保证 MySQL 方言下生效
  await queryInterface.sequelize.query(
    'ALTER TABLE `user_user` ADD UNIQUE INDEX `uk_phone_delete_version` (`phone`(128), `delete_version`)'
  );
}

export async function down({ queryInterface, Sequelize }) {
  // 回滚前校验：若已存在密文（含冒号），缩窄为 STRING(20) 会截断/失败，直接拒绝回滚
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c FROM user_user WHERE phone LIKE '%:%'`
  );
  const count = Number(rows?.[0]?.c ?? rows?.[0]?.count ?? 0);
  if (count > 0) {
    throw new Error(`无法回滚手机号列加宽：已存在 ${count} 条密文，缩窄会破坏数据，请先备份/解密`);
  }

  await queryInterface.removeIndex('user_user', 'uk_phone_delete_version');

  await queryInterface.changeColumn('user_user', 'phone', {
    type: Sequelize.STRING(20),
    allowNull: true,
    comment: '联系手机号'
  });

  await queryInterface.addIndex('user_user', ['phone', 'delete_version'], {
    name: 'uk_phone_delete_version',
    unique: true
  });
}
