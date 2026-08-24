/**
 * oauth_clients 表新增 scope_metadata 列
 * 存储各 app 自定义的 scope 描述覆盖（来自 app config.js 的 oauth_client.scope_metadata），
 * 授权页展示时由后端 resolveScopeDetails 合并 registry 默认描述 + 客户端覆盖。
 *
 * @author yijiu2025
 * @since 2026-08-24
 */

const COLUMN_NAME = 'scope_metadata';

export async function up({ queryInterface, Sequelize }) {
  const [columns] = await queryInterface.sequelize.query(
    `SHOW COLUMNS FROM oauth_clients WHERE Field = '${COLUMN_NAME}'`
  );
  if (columns.length > 0) {
    console.log(`ℹ️  [Migrate] oauth_clients.${COLUMN_NAME} 已存在，跳过`);
    return;
  }
  await queryInterface.addColumn('oauth_clients', COLUMN_NAME, {
    type: Sequelize.JSON,
    allowNull: true,
    defaultValue: null,
    comment: 'scope 描述覆盖（来自 app config，授权页展示用）'
  });
  console.log(`✅ [Migrate] oauth_clients.${COLUMN_NAME} 列已添加`);
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('oauth_clients', COLUMN_NAME);
}
