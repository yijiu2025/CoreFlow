/**
 * 迁移：为 session_tokens 表添加 revoked 字段
 * 用于支持会话吊销功能
 */

export async function up({ queryInterface, Sequelize }) {
  const tableDesc = await queryInterface.describeTable('session_tokens');
  if (!tableDesc.revoked) {
    await queryInterface.addColumn('session_tokens', 'revoked', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: '是否已吊销'
    });
  }
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('session_tokens', 'revoked');
}
