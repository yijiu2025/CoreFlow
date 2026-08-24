/**
 * 迁移：创建用户注销申请表 user_deactivation
 *
 * 用户注销流程：申请 → 拒登录(7天撤销期) → 到期正式执行
 * scope=app：注销某 app（清该 app 授权/session，不动 user 主表）
 * scope=all：注销全部（清所有 app + 软删 user_user）
 *
 * 幂等设计：表已存在时跳过
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

  await createTableIfNotExists('user_deactivation', {
    id: {
      type: Sequelize.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      comment: '主键'
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '关联 user_user.id'
    },
    uid: {
      type: Sequelize.UUID,
      allowNull: false,
      comment: '关联 user_user.uid，便于跨表查询 OAuth 数据'
    },
    scope: {
      type: Sequelize.ENUM('app', 'all'),
      allowNull: false,
      comment: '注销范围：app=单个应用，all=全部数据'
    },
    app_id: {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: 'scope=app 时填应用标识；scope=all 时为 NULL'
    },
    status: {
      type: Sequelize.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '1=注销中(待撤销)，2=已撤销，3=已执行(正式注销完成)'
    },
    reason: {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '注销原因'
    },
    requested_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: '申请提交时间'
    },
    scheduled_at: {
      type: Sequelize.DATE,
      allowNull: false,
      comment: '计划执行时间（requested_at + 7 天），到期可正式执行'
    },
    revoked_at: {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '撤销时间'
    },
    executed_at: {
      type: Sequelize.DATE,
      allowNull: true,
      comment: '正式执行时间'
    },
    revoked_by: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '撤销操作者 user_id（用户自助撤销时填自己，管理员撤销时填管理员 id）'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
    }
  });

  // 查询活跃申请用（user_id + status）
  await addIndexIfNotExists('user_deactivation', ['user_id', 'status'], {
    name: 'idx_user_status',
    indicesType: 'INDEX'
  });
  // 按到期时间扫描待执行申请（后台定时任务用）
  await addIndexIfNotExists('user_deactivation', ['status', 'scheduled_at'], {
    name: 'idx_status_scheduled',
    indicesType: 'INDEX'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('user_deactivation');
}
