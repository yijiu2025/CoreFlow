/**
 * 迁移：创建 IAM 权限管理相关表
 * 包含：iam_role, iam_user_role, iam_inline_policy, permissions
 * 幂等设计：表已存在时跳过创建
 */

export async function up({ queryInterface, Sequelize }) {
  // 辅助函数：幂等建表
  async function createTableIfNotExists(tableName, columns, options = {}) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) {
      await queryInterface.createTable(tableName, columns, options);
    }
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      // 索引已存在时忽略
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  // 1. iam_role - 角色定义主表
  await createTableIfNotExists('iam_role', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    app_id: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'GLOBAL', comment: '所属应用ID' },
    code: { type: Sequelize.STRING(50), allowNull: false, comment: '角色唯一编码' },
    name: { type: Sequelize.STRING(50), allowNull: false, comment: '角色显示名称' },
    rank_level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1, comment: '职级权重(0-99)' },
    policy: { type: Sequelize.JSON, allowNull: false, comment: '角色策略文档 (PBAC)' },
    description: { type: Sequelize.STRING(255), comment: '角色描述' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('iam_role', ['app_id', 'code', 'delete_version'], { unique: true, name: 'uk_role_app_code' });

  // 2. iam_user_role - 用户与角色关联表
  await createTableIfNotExists('iam_user_role', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '用户ID' },
    role_id: { type: Sequelize.BIGINT, allowNull: false, comment: '角色ID' },
    app_id: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'GLOBAL', comment: '应用标识' },
    expire_at: { type: Sequelize.DATE, allowNull: true, comment: '角色过期时间' },
    granted_by: { type: Sequelize.BIGINT, allowNull: true, comment: '授权人ID' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('iam_user_role', ['user_id', 'role_id', 'app_id', 'delete_version'], { unique: true, name: 'uk_user_role' });
  await addIndexIfNotExists('iam_user_role', ['user_id', 'app_id', 'expire_at'], { name: 'idx_user_app_expire' });

  // 3. iam_inline_policy - 用户内联策略表
  await createTableIfNotExists('iam_inline_policy', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联用户ID' },
    app_id: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'GLOBAL', comment: '应用标识' },
    policy: { type: Sequelize.JSON, allowNull: false, comment: '用户个人策略文档' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('iam_inline_policy', ['user_id', 'app_id']);

  // 4. permissions - 应用权限明细表
  await createTableIfNotExists('permissions', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: Sequelize.STRING(100), allowNull: false, comment: '权限名称' },
    module: { type: Sequelize.STRING(100), allowNull: false, comment: '所属模块' },
    action: { type: Sequelize.STRING(100), allowNull: false, comment: '操作编码' },
    app_id: { type: Sequelize.STRING(100), allowNull: false, comment: '所属应用ID' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('permissions', ['app_id', 'module', 'action'], { unique: true, name: 'uk_app_module_action' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('permissions');
  await queryInterface.dropTable('iam_inline_policy');
  await queryInterface.dropTable('iam_user_role');
  await queryInterface.dropTable('iam_role');
}
