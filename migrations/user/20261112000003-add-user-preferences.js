/**
 * 用户个人偏好（JSON）
 *
 * 目前只放**界面偏好**（主题色）。为什么不放 localStorage：
 * 换台设备登录就变回默认，用户会以为"设置没保存"。偏好跟账号走才是预期行为。
 *
 * 为什么用 JSON 列而不是给每个偏好建字段：这类键增长快、只整体读写、
 * 不做查询条件（不会有人 `WHERE accent = 'teal'`），加字段只会让 user 表越来越宽。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('user_user', 'preferences', {
    type: Sequelize.JSON,
    allowNull: true,
    comment: '个人偏好（界面设置等）：{ accent?: string }'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('user_user', 'preferences');
}
