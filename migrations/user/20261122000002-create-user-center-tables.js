/**
 * 迁移：用户中心的两张个人能力表
 *
 * 1. `user_api_tokens`  —— 个人 API 令牌（只存哈希，明文仅在签发响应出现一次）
 * 2. `user_identities`  —— 第三方账号绑定（与认证凭证表 `user_identity` 分离）
 *
 * 幂等：表 / 索引都已存在时跳过（迁移可能因网络中断被重跑）。
 * 回滚：两张表都是本迁移新建的，down 直接删除；没有需要回填的历史数据。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */

/**
 * 表是否已存在
 *
 * @param {object} queryInterface Sequelize QueryInterface
 * @param {string} table 表名
 * @returns {Promise<boolean>} 是否存在
 */
async function hasTable(queryInterface, table) {
  const [rows] = await queryInterface.sequelize.query('SHOW TABLES');
  return rows.some(row => Object.values(row)[0] === table);
}

/**
 * 索引不存在时才创建
 *
 * 单独判一次而不是"建表完顺手 addIndex"：表已存在但索引缺失（半途失败）时，
 * 重跑迁移仍应把索引补齐，而不是因为表在就整段跳过。
 *
 * @param {object} queryInterface Sequelize QueryInterface
 * @param {string} table 表名
 * @param {string[]} fields 字段
 * @param {object} options addIndex 选项（必须含显式 name）
 * @returns {Promise<void>}
 */
async function ensureIndex(queryInterface, table, fields, options) {
  const indexes = await queryInterface.showIndex(table);
  if (indexes.some(item => item.name === options.name)) return;
  await queryInterface.addIndex(table, fields, options);
}

export async function up({ queryInterface, Sequelize }) {
  if (!(await hasTable(queryInterface, 'user_api_tokens'))) {
    await queryInterface.createTable('user_api_tokens', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '所属用户 user_user.id'
      },
      name: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: '令牌用途名称'
      },
      prefix: {
        type: Sequelize.STRING(12),
        allowNull: false,
        comment: '明文前 12 字符（仅用于界面识别）'
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        comment: 'sha256(明文) 十六进制'
      },
      scopes: {
        type: Sequelize.JSON,
        allowNull: false,
        comment: '令牌作用域 id 列表'
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '最近一次使用时间'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '失效时间；NULL 表示不过期'
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '吊销时间；非空即不可用'
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
  }

  await ensureIndex(queryInterface, 'user_api_tokens', ['user_id'], { name: 'idx_user_api_tokens_user' });
  await ensureIndex(queryInterface, 'user_api_tokens', ['prefix'], { name: 'idx_user_api_tokens_prefix' });
  await ensureIndex(queryInterface, 'user_api_tokens', ['token_hash'], {
    name: 'uk_user_api_tokens_hash',
    unique: true
  });

  if (!(await hasTable(queryInterface, 'user_identities'))) {
    await queryInterface.createTable('user_identities', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '所属用户 user_user.id'
      },
      provider: {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment: '第三方平台标识'
      },
      provider_uid: {
        type: Sequelize.STRING(128),
        allowNull: false,
        comment: '第三方平台侧用户唯一标识'
      },
      display_name: {
        type: Sequelize.STRING(128),
        allowNull: true,
        comment: '第三方平台显示名快照'
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
  }

  await ensureIndex(queryInterface, 'user_identities', ['user_id'], { name: 'idx_user_identities_user' });
  await ensureIndex(queryInterface, 'user_identities', ['provider', 'provider_uid'], {
    name: 'uk_user_identities_provider_uid',
    unique: true
  });
}

export async function down({ queryInterface }) {
  if (await hasTable(queryInterface, 'user_identities')) {
    await queryInterface.dropTable('user_identities');
  }
  if (await hasTable(queryInterface, 'user_api_tokens')) {
    await queryInterface.dropTable('user_api_tokens');
  }
}
