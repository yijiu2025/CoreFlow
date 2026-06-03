/**
 * 迁移：创建 OAuth 2.1 相关表
 * 包含：oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents
 * 幂等设计：表已存在时跳过
 */

export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  // 1. oauth_clients
  await createTableIfNotExists('oauth_clients', {
    client_id: { type: Sequelize.STRING(128), primaryKey: true, comment: '客户端唯一标识' },
    client_name: { type: Sequelize.STRING(100), allowNull: false, comment: '客户端名称' },
    client_secret: { type: Sequelize.STRING(255), allowNull: true, comment: '客户端密钥' },
    redirect_uris: { type: Sequelize.JSON, defaultValue: [], comment: '回调地址列表' },
    grant_types: { type: Sequelize.JSON, defaultValue: ['authorization_code'], comment: '授权类型' },
    response_types: { type: Sequelize.JSON, defaultValue: ['code'], comment: '响应类型' },
    scope: { type: Sequelize.STRING(500), defaultValue: 'openid profile', comment: '权限范围' },
    token_endpoint_auth_method: { type: Sequelize.STRING(50), defaultValue: 'none', comment: '认证方式' },
    application_type: { type: Sequelize.STRING(20), defaultValue: 'web', comment: '应用类型' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  // 2. oauth_codes
  await createTableIfNotExists('oauth_codes', {
    code: { type: Sequelize.STRING(128), primaryKey: true, comment: '授权码' },
    client_id: { type: Sequelize.STRING(128), allowNull: false, comment: '客户端ID' },
    sub: { type: Sequelize.UUID, allowNull: false, comment: '用户UUID' },
    redirect_uri: { type: Sequelize.STRING(500), allowNull: false, comment: '回调地址' },
    scope: { type: Sequelize.STRING(500), comment: '权限范围' },
    code_challenge: { type: Sequelize.STRING(128), allowNull: true, comment: 'PKCE challenge' },
    code_challenge_method: { type: Sequelize.STRING(10), defaultValue: 'S256', comment: 'PKCE method' },
    nonce: { type: Sequelize.STRING(128), allowNull: true, comment: 'OIDC nonce' },
    consumed: { type: Sequelize.BOOLEAN, defaultValue: false, comment: '是否已消费' },
    expires_at: { type: Sequelize.DATE, allowNull: false, comment: '过期时间' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('oauth_codes', ['client_id', 'consumed', 'expires_at'], { name: 'idx_code_validate_cleanup' });

  // 3. oauth_tokens
  await createTableIfNotExists('oauth_tokens', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    refresh_token: { type: Sequelize.STRING(255), unique: true, allowNull: false, comment: '刷新令牌' },
    sub: { type: Sequelize.STRING(128), allowNull: false, comment: '主体ID' },
    client_id: { type: Sequelize.STRING(128), allowNull: false, comment: '客户端ID' },
    scope: { type: Sequelize.STRING(500), comment: '权限范围' },
    revoked: { type: Sequelize.BOOLEAN, defaultValue: false, comment: '是否已吊销' },
    expires_at: { type: Sequelize.DATE, allowNull: false, comment: '过期时间' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('oauth_tokens', ['client_id'], { name: 'idx_token_client' });
  await addIndexIfNotExists('oauth_tokens', ['expires_at'], { name: 'idx_token_expires' });
  await addIndexIfNotExists('oauth_tokens', ['sub', 'client_id', 'revoked'], { name: 'idx_token_validation' });
  await addIndexIfNotExists('oauth_tokens', ['revoked', 'expires_at'], { name: 'idx_token_cleanup' });

  // 4. oauth_user_approval
  await createTableIfNotExists('oauth_user_approval', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    sub: { type: Sequelize.UUID, allowNull: false, comment: '用户UUID' },
    app_id: { type: Sequelize.STRING(64), allowNull: false, comment: '应用标识' },
    scopes: { type: Sequelize.JSON, defaultValue: [], comment: '授权范围' },
    status: { type: Sequelize.TINYINT, defaultValue: 1, comment: '1:正常, 0:已撤销' },
    last_auth_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), comment: '最后授权时间' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('oauth_user_approval', ['sub', 'app_id'], { unique: true, name: 'uk_approval_sub_app' });

  // 5. oauth_consents
  await createTableIfNotExists('oauth_consents', {
    id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
    sub: { type: Sequelize.UUID, allowNull: false, comment: '用户UUID' },
    client_id: { type: Sequelize.STRING(128), allowNull: false, comment: '客户端ID' },
    scopes: { type: Sequelize.JSON, defaultValue: [], comment: '已授权范围' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
  });

  await addIndexIfNotExists('oauth_consents', ['sub', 'client_id'], { unique: true, name: 'uk_sub_client' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('oauth_consents');
  await queryInterface.dropTable('oauth_user_approval');
  await queryInterface.dropTable('oauth_tokens');
  await queryInterface.dropTable('oauth_codes');
  await queryInterface.dropTable('oauth_clients');
}
