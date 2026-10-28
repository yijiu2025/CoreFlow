/**
 * 加宽 user_user.phone 列以容纳 AES 加密后的密文
 *
 * 背景：
 *   加密迁移（20260713000001-encrypt-phone.js）把明文手机号改为
 *   base64(IV):base64(ciphertext) 格式，长度约 100+ 字符；
 *   而原建表迁移把 phone 建为 STRING(20)，密文放不下（截断/Data too long）。
 *
 * 做法：
 *   1. 先删掉依赖该列的唯一索引 uk_phone_delete_version
 *   2. phone 列改为 TEXT
 *   3. 重建唯一索引（TEXT 列唯一索引必须带前缀长度，取 128 字符）
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.removeIndex('user_user', 'uk_phone_delete_version');

  await queryInterface.changeColumn('user_user', 'phone', {
    type: Sequelize.TEXT,
    allowNull: true,
    comment: '联系手机号（AES 加密后 base64:base64）'
  });

  // TEXT 唯一索引需指定前缀长度；用原生 SQL 保证 MySQL 方言下生效
  await queryInterface.sequelize.query(
    'ALTER TABLE `user_user` ADD UNIQUE INDEX `uk_phone_delete_version` (`phone`(128), `delete_version`)'
  );
}

export async function down({ queryInterface, Sequelize }) {
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
