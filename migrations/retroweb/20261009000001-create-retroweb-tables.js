/**
 * RetroWeb 表迁移（首批）
 *
 * 建 5 张表：task / scheme / job / user_settings / llm_profile。
 * 表结构的设计理由写在各自模型文件的头部注释里（models/retroweb/*.js）。
 *
 * 🔴 全部走 `createTableIfNotExists`：迁移可能被重跑（多环境、手工补跑），
 *    直接 createTable 会因 "table already exists" 中断整个 migrate 流程。
 *
 * @since 2026-10-09
 */
export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some(t => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  // ---------- 1. 任务 ----------
  await createTableIfNotExists('retroweb_task', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    client_id: { type: Sequelize.STRING(64), allowNull: true },
    name: { type: Sequelize.STRING(200), allowNull: false, defaultValue: '' },
    target: { type: Sequelize.TEXT, allowNull: false },
    model: { type: Sequelize.STRING(64), allowNull: true },
    status: { type: Sequelize.ENUM('running', 'incomplete', 'done'), allowNull: false, defaultValue: 'incomplete' },
    // 冗余统计列：列表/排序不解析 snapshot
    node_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    step_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    depth: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    scheme_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    sig: { type: Sequelize.STRING(64), allowNull: true },
    snapshot: { type: Sequelize.BLOB('medium'), allowNull: true },
    size_bytes: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });
  await addIndexIfNotExists('retroweb_task', ['user_id', 'updated_at'], { name: 'idx_task_user_updated' });
  await addIndexIfNotExists('retroweb_task', ['user_id', 'status'], { name: 'idx_task_user_status' });
  await addIndexIfNotExists('retroweb_task', ['user_id', 'target'], { name: 'idx_task_user_target' });
  await addIndexIfNotExists('retroweb_task', ['user_id', 'client_id'], { name: 'idx_task_user_client' });

  // ---------- 2. 路线方案 ----------
  await createTableIfNotExists('retroweb_scheme', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    task_id: { type: Sequelize.BIGINT, allowNull: false },
    name: { type: Sequelize.STRING(200), allowNull: false, defaultValue: '' },
    route_json: { type: Sequelize.JSON, allowNull: true },
    stats_json: { type: Sequelize.JSON, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });
  await addIndexIfNotExists('retroweb_scheme', ['user_id', 'task_id'], { name: 'idx_scheme_user_task' });
  await addIndexIfNotExists('retroweb_scheme', ['task_id', 'updated_at'], { name: 'idx_scheme_task_updated' });

  // ---------- 3. 算法任务（含 stale 态） ----------
  await createTableIfNotExists('retroweb_job', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    task_id: { type: Sequelize.BIGINT, allowNull: true },
    kind: { type: Sequelize.STRING(32), allowNull: false },
    provider_job_id: { type: Sequelize.STRING(64), allowNull: true },
    status: {
      type: Sequelize.ENUM('queued', 'running', 'done', 'failed', 'stale'),
      allowNull: false,
      defaultValue: 'queued'
    },
    params_json: { type: Sequelize.JSON, allowNull: true },
    progress_json: { type: Sequelize.JSON, allowNull: true },
    result_json: { type: Sequelize.JSON, allowNull: true },
    error_text: { type: Sequelize.TEXT, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    },
    finished_at: { type: Sequelize.DATE, allowNull: true }
  });
  await addIndexIfNotExists('retroweb_job', ['user_id', 'status'], { name: 'idx_job_user_status' });
  await addIndexIfNotExists('retroweb_job', ['task_id'], { name: 'idx_job_task' });
  await addIndexIfNotExists('retroweb_job', ['provider_job_id'], { name: 'idx_job_provider' });

  // ---------- 4. 用户设置 ----------
  await createTableIfNotExists('retroweb_user_settings', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false, unique: true },
    settings: { type: Sequelize.TEXT, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });
  await addIndexIfNotExists('retroweb_user_settings', ['user_id'], {
    unique: true,
    name: 'uk_retroweb_settings_user'
  });

  // ---------- 5. 大模型端点配置（密钥加密，双来源） ----------
  await createTableIfNotExists('retroweb_llm_profile', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false },
    owner: { type: Sequelize.ENUM('user', 'system'), allowNull: false, defaultValue: 'user' },
    name: { type: Sequelize.STRING(100), allowNull: false, defaultValue: '默认' },
    base_url: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
    model: { type: Sequelize.STRING(100), allowNull: false, defaultValue: '' },
    keys_enc: { type: Sequelize.TEXT, allowNull: true },
    active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    max_tokens: { type: Sequelize.INTEGER, allowNull: true },
    extra_json: { type: Sequelize.JSON, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });
  await addIndexIfNotExists('retroweb_llm_profile', ['user_id'], { name: 'idx_llm_profile_user' });
  await addIndexIfNotExists('retroweb_llm_profile', ['user_id', 'active'], { name: 'idx_llm_profile_active' });
  await addIndexIfNotExists('retroweb_llm_profile', ['owner'], { name: 'idx_llm_profile_owner' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('retroweb_llm_profile');
  await queryInterface.dropTable('retroweb_user_settings');
  await queryInterface.dropTable('retroweb_job');
  await queryInterface.dropTable('retroweb_scheme');
  await queryInterface.dropTable('retroweb_task');
}
