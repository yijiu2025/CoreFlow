/**
 * 迁移：创建通知中心相关表
 * 包含：notice_templates, notice_event_subscriptions, notice_user_preferences, notice_delivery_logs
 * 幂等设计：表已存在时跳过建表，索引已存在时跳过建索引，down 也允许重复执行
 */

export async function up({ queryInterface, Sequelize }) {
  // 1. 模板：一个「事件 × 渠道」一行，code 复用事件 code
  await createTableIfNotExists(queryInterface, 'notice_templates', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, comment: '主键' },
    code: { type: Sequelize.STRING(64), allowNull: false, comment: '模板编码（与事件 code 一致）' },
    name: { type: Sequelize.STRING(64), allowNull: false, comment: '模板名称' },
    channel: { type: Sequelize.STRING(32), allowNull: false, comment: '渠道 id' },
    subject: { type: Sequelize.STRING(200), allowNull: true, comment: '标题' },
    body: { type: Sequelize.TEXT, allowNull: false, comment: '正文模板（{{变量}} 形式）' },
    variables: { type: Sequelize.JSON, allowNull: true, comment: '声明的变量名数组' },
    enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await addIndexIfNotExists(queryInterface, 'notice_templates', ['code'], {
    unique: true,
    name: 'uk_notice_templates_code'
  });
  await addIndexIfNotExists(queryInterface, 'notice_templates', ['channel'], {
    name: 'idx_notice_templates_channel'
  });

  // 2. 全局默认订阅：个人没配过时看这里
  await createTableIfNotExists(queryInterface, 'notice_event_subscriptions', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, comment: '主键' },
    event_code: { type: Sequelize.STRING(64), allowNull: false, comment: '事件 code' },
    channel: { type: Sequelize.STRING(32), allowNull: false, comment: '渠道 id' },
    enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否默认开启' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await addIndexIfNotExists(queryInterface, 'notice_event_subscriptions', ['event_code', 'channel'], {
    unique: true,
    name: 'uk_notice_event_subscriptions_event_channel'
  });

  // 3. 个人偏好：行不存在 = 跟随全局（不能当成 false）
  await createTableIfNotExists(queryInterface, 'notice_user_preferences', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, comment: '主键' },
    user_id: { type: Sequelize.INTEGER, allowNull: false, comment: '用户数字主键' },
    event_code: { type: Sequelize.STRING(64), allowNull: false, comment: '事件 code' },
    channel: { type: Sequelize.STRING(32), allowNull: false, comment: '渠道 id' },
    enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否接收' },
    quiet_from: { type: Sequelize.TIME, allowNull: true, comment: '免打扰开始（含）' },
    quiet_to: { type: Sequelize.TIME, allowNull: true, comment: '免打扰结束（不含，可跨天）' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await addIndexIfNotExists(queryInterface, 'notice_user_preferences', ['user_id', 'event_code', 'channel'], {
    unique: true,
    name: 'uk_notice_user_preferences_user_event_channel'
  });

  // 4. 投递日志：列表按时间倒序 + 按状态筛选
  await createTableIfNotExists(queryInterface, 'notice_delivery_logs', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, comment: '主键' },
    event_code: { type: Sequelize.STRING(64), allowNull: false, comment: '事件 code' },
    channel: { type: Sequelize.STRING(32), allowNull: false, comment: '渠道 id' },
    user_id: { type: Sequelize.INTEGER, allowNull: true, comment: '接收人数字主键' },
    target: { type: Sequelize.STRING(200), allowNull: true, comment: '收件地址' },
    status: { type: Sequelize.STRING(16), allowNull: false, comment: 'sent | failed' },
    error: { type: Sequelize.STRING(500), allowNull: true, comment: '失败原因' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  await addIndexIfNotExists(queryInterface, 'notice_delivery_logs', ['created_at'], {
    name: 'idx_notice_delivery_logs_created_at'
  });
  await addIndexIfNotExists(queryInterface, 'notice_delivery_logs', ['status'], {
    name: 'idx_notice_delivery_logs_status'
  });
}

export async function down({ queryInterface }) {
  // 先删无依赖的日志，再删配置类表；每张都判存在，允许半途失败后重跑
  await dropTableIfExists(queryInterface, 'notice_delivery_logs');
  await dropTableIfExists(queryInterface, 'notice_user_preferences');
  await dropTableIfExists(queryInterface, 'notice_event_subscriptions');
  await dropTableIfExists(queryInterface, 'notice_templates');
}

// ============== 幂等工具函数（与 migrations/README.md 模板一致，文件内联） ==============

/**
 * 幂等建表：表已存在时跳过
 */
async function createTableIfNotExists(queryInterface, tableName, columns) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some(t => Object.values(t)[0] === tableName);
  if (!exists) await queryInterface.createTable(tableName, columns);
}

/**
 * 幂等加索引：索引已存在时跳过
 */
async function addIndexIfNotExists(queryInterface, tableName, columns, options = {}) {
  try {
    await queryInterface.addIndex(tableName, columns, options);
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

/**
 * 幂等删表：表不存在时跳过（down 可重复执行）
 */
async function dropTableIfExists(queryInterface, tableName) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
  const exists = tables.some(t => Object.values(t)[0] === tableName);
  if (exists) await queryInterface.dropTable(tableName);
}
