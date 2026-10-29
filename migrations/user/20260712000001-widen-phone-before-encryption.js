/**
 * 在手机号加密迁移之前加宽 phone 列（修复历史顺序缺陷）
 *
 * 背景：加密迁移（20260713000001）原本晚于本迁移，导致密文写不进 VARCHAR(20)。
 * 本迁移时间戳早于加密迁移，保证**全新环境**先加宽再加密；
 * 对已按错误顺序执行过的历史环境，由 20261028000002-repair-phone-encryption.js 补偿。
 */
export async function up({ queryInterface, Sequelize }) {
  try {
    await queryInterface.removeIndex('user_user', 'uk_phone_delete_version');
  } catch {
    // 索引不存在时忽略
  }

  await queryInterface.changeColumn('user_user', 'phone', {
    type: Sequelize.TEXT,
    allowNull: true,
    comment: '联系手机号（AES 加密后 base64:base64:base64）'
  });

  await queryInterface.sequelize.query(
    'ALTER TABLE `user_user` ADD UNIQUE INDEX `uk_phone_delete_version` (`phone`(128), `delete_version`)'
  );
}

export async function down({ queryInterface, Sequelize }) {
  // 若已存在密文，缩窄会破坏数据，拒绝回滚
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c FROM user_user WHERE phone LIKE '%:%'`
  );
  const count = Number(rows?.[0]?.c ?? rows?.[0]?.count ?? 0);
  if (count > 0) {
    throw new Error(`无法回滚手机号列加宽：已存在 ${count} 条密文，缩窄会破坏数据`);
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
