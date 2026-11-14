/**
 * 后台管理（console）的用户个人资料：昵称 / 头像 / 界面偏好
 *
 * 为什么落在 console 域而不是共享的 user 域：
 * `user_user` 是**所有应用共享的身份表**，它的 username / avatar 是全局身份。
 * 而"在后台管理里显示成什么名字、用什么头像"是这个应用的展示层选择 ——
 * 换成防火墙后台，用户可能希望显示成另一套。把这类字段塞进身份表，
 * 会让每个应用都去抢同一列，且注销/审计时也说不清该保留谁。
 *
 * 所以一张 console 自己的表：一个用户一行，缺失时前端回落到全局 username / avatar。
 * 其它应用要自己的展示身份时，各建各的表（模型也放各自的 models 目录），互不影响。
 *
 * 表里同时承载 `preferences`（主题色等界面偏好）：它们同属"这个用户在 console 里的个人设置"，
 * 生命周期完全一致（注销时一起清、一起搬），没有拆成两张表的理由。
 *
 * 历史数据：`app_user_preference` 里 `app_id='console'` 的行搬进来后删表 ——
 * 那张表是上一版"通用多应用偏好"的设计，现在只服务 console，没必要保留通用层。
 */
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('console_user_profile', {
    user_id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      allowNull: false,
      comment: '用户内部 ID（一个用户一行）'
    },
    nickname: {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: '后台内显示的昵称（空 = 回落 username）'
    },
    avatar: {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '后台内显示的头像 URL（空 = 回落 user_user.avatar）'
    },
    preferences: {
      type: Sequelize.JSON,
      allowNull: true,
      comment: '界面偏好：{ accent?: string }'
    },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  });

  // 搬迁旧偏好（上一版把偏好放在 app_user_preference 的 console 行里）
  const [tables] = await queryInterface.sequelize.query(
    `SELECT TABLE_NAME AS t FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user_preference'`
  );
  if (Array.isArray(tables) && tables.length > 0) {
    await queryInterface.sequelize.query(
      `INSERT INTO console_user_profile (user_id, preferences, created_at, updated_at)
       SELECT user_id, preferences, NOW(), NOW() FROM app_user_preference WHERE app_id = 'console'`
    );
    await queryInterface.dropTable('app_user_preference');
  }
}

export async function down({ queryInterface, Sequelize }) {
  await queryInterface.createTable('app_user_preference', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    app_id: { type: Sequelize.STRING(64), allowNull: false },
    preferences: { type: Sequelize.JSON, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false },
    updated_at: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.sequelize.query(
    `INSERT INTO app_user_preference (user_id, app_id, preferences, created_at, updated_at)
     SELECT user_id, 'console', preferences, NOW(), NOW() FROM console_user_profile`
  );
  await queryInterface.dropTable('console_user_profile');
}
