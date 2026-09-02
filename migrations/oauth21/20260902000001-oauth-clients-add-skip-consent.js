/**
 * oauth_clients 表新增 skip_consent 列
 * 一方应用首次登录 directLogin 时跳过 consent 确认页，自动写 Approval + 默认权限。
 * 默认 false，仅一方应用在 config.js 的 oauth_client 块显式置 true。
 * 三方应用保持 false，走标准 consent 确认（OAuth 2.1 安全要求）。
 *
 * @author yijiu2025
 * @since 2026-09-02
 */

const COLUMN_NAME = 'skip_consent';

export async function up({ queryInterface, Sequelize }) {
  const [columns] = await queryInterface.sequelize.query(
    `SHOW COLUMNS FROM oauth_clients WHERE Field = '${COLUMN_NAME}'`
  );
  if (columns.length > 0) {
    console.log(`ℹ️  [Migrate] oauth_clients.${COLUMN_NAME} 已存在，跳过`);
    return;
  }
  await queryInterface.addColumn('oauth_clients', COLUMN_NAME, {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '首次登录是否跳过 consent 自动授权（一方应用用，默认 false）'
  });
  console.log(`✅ [Migrate] oauth_clients.${COLUMN_NAME} 列已添加`);
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('oauth_clients', COLUMN_NAME);
}
