/**
 * 应用级用户偏好：把 preferences 从 user_user 挪到 (user, app) 维度
 *
 * 为什么改：`user_user` 是**共享身份表**，所有应用（console / firewall / oauth21 …）
 * 都读它。而"主题色"是**后台管理这个应用**的界面偏好 —— 放在身份表上等于让
 * 一个应用的 UI 细节污染全局模型；等 firewall 也要自己的偏好时，两边会开始抢同一个 JSON 键。
 *
 * 所以拆成 `app_user_preference(user_id, app_id, preferences)`：
 *   - 一个用户 × 一个应用 = 一行，互不干扰；
 *   - JSON 列，加新偏好键不需要再开迁移；
 *   - 唯一约束 `(user_id, app_id)` 保证 upsert 语义。
 *
 * 历史数据处理：已写入的 `user_user.preferences` 全部视为 `console` 应用的偏好
 * （那是唯一写过的应用），迁移时搬过去再删列，避免丢用户已选的主题色。
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('app_user_preference', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '用户内部 ID' },
    app_id: { type: Sequelize.STRING(64), allowNull: false, comment: '应用 ID（console / firewall …）' },
    preferences: { type: Sequelize.JSON, allowNull: true, comment: '该应用下的界面偏好' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  });

  await queryInterface.addIndex('app_user_preference', ['user_id', 'app_id'], {
    name: 'uk_app_user_pref',
    unique: true
  });

  // 老数据：老列只服务过 console
  await queryInterface.sequelize.query(
    `INSERT INTO app_user_preference (user_id, app_id, preferences, created_at, updated_at)
     SELECT id, 'console', preferences, NOW(), NOW() FROM user_user WHERE preferences IS NOT NULL`
  );

  await queryInterface.removeColumn('user_user', 'preferences');
}

export async function down({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('user_user', 'preferences', {
    type: Sequelize.JSON,
    allowNull: true,
    comment: '个人偏好（已废弃：迁至 app_user_preference）'
  });

  // 回滚只搬 console 的，其余应用的数据本来就没有承载它的列
  await queryInterface.sequelize.query(
    `UPDATE user_user u
       JOIN app_user_preference p ON p.user_id = u.id AND p.app_id = 'console'
        SET u.preferences = p.preferences`
  );

  await queryInterface.dropTable('app_user_preference');
}
