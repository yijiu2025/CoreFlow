/**
 * 注销申请：新增身份快照列
 *
 * 为什么需要：注销执行时会把 `user_user.username` 改成 `已注销用户#N`、`email` 清空，
 * 这是有意的 PII 擦除。但擦除之后，登录日志与审计里那批历史会话就彻底失去了归属 ——
 * `session_logs` 只存 `user_id`，`user_deactivation` 又不记身份，于是界面上只能显示
 * 「已注销用户#31」，管理员无法判断"这条登录到底是谁的"。
 *
 * 所以在擦除**之前**把用户名与邮箱留一份快照在申请单上，供管理侧日志追溯。
 * 快照只落在 `user_deactivation`（管理员可见的后台表），不放回 `user_user`：
 * 主表要保持"已注销即不可识别"，否则任何按 id 查用户的地方都会重新拿到 PII。
 *
 * 历史数据无法回填：本迁移之前执行的注销，原名/邮箱已被抹除，列只能为 NULL。
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('user_deactivation', 'username_snapshot', {
    type: Sequelize.STRING(64),
    allowNull: true,
    comment: '注销前的用户名（擦除前留档，供日志追溯）'
  });
  await queryInterface.addColumn('user_deactivation', 'email_snapshot', {
    type: Sequelize.STRING(255),
    allowNull: true,
    comment: '注销前的邮箱（擦除前留档，供日志追溯）'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.removeColumn('user_deactivation', 'username_snapshot');
  await queryInterface.removeColumn('user_deactivation', 'email_snapshot');
}
