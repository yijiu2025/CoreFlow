/**
 * 迁移：创建 OAuth 2.1 授权系统相关表
 * 包含：oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents
 */

export async function up({ queryInterface, Sequelize }) {
  // 1. oauth_clients - OAuth 客户端注册表
  await queryInterface.createTable('oauth_clients', {
    client_id: {
      type: Sequelize.STRING(128),
      primaryKey: true,
      comment: '客户端唯一标识'
    },
    client_name: {
      type: Sequelize.STRING(100),
      allowNull: false,
      comment: '客户端名称'
    },
    client_secret: {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: '客户端密钥（公共客户端为 null）'
    },
    redirect_uris: {
      type: Sequelize.JSON,
      defaultValue: [],
      comment: '允许的回调地址列表'
    },
    grant_types: {
      type: Sequelize.JSON,
      defaultValue: ['authorization_code'],
      comment: '支持的授权类型列表'
    },
    response_types: {
      type: Sequelize.JSON,
      defaultValue: ['code'],
      comment: '支持的响应类型列表'
    },
    scope: {
      type: Sequelize.STRING(500),
      defaultValue: 'openid profile',
      comment: '允许的权限范围（空格分隔）'
    },
    token_endpoint_auth_method: {
      type: Sequelize.STRING(50),
      defaultValue: 'none',
      comment: 'Token 端点认证方式'
    },
    application_type: {
      type: Sequelize.STRING(20),
      defaultValue: 'web',
      comment: '应用类型：web / service'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });

  // 2. oauth_codes - 授权码表
  await queryInterface.createTable('oauth_codes', {
    code: {
      type: Sequelize.STRING(128),
      primaryKey: true,
      comment: '授权码值'
    },
    client_id: {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: '关联的客户端 ID'
    },
    sub: {
      type: Sequelize.UUID,
      allowNull: false,
      comment: '用户唯一标识（sub claim）'
    },
    redirect_uri: {
      type: Sequelize.STRING(500),
      allowNull: false,
      comment: '回调地址'
    },
    scope: {
      type: Sequelize.STRING(500),
      comment: '授权的权限范围'
    },
    code_challenge: {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: 'PKCE code_challenge 值'
    },
    code_challenge_method: {
      type: Sequelize.STRING(10),
      defaultValue: 'S256',
      comment: 'PKCE code_challenge_method'
    },
    nonce: {
      type: Sequelize.STRING(128),
      allowNull: true,
      comment: 'OIDC nonce 值'
    },
    consumed: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: '是否已被消费'
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: false,
      comment: '过期时间'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });

  await queryInterface.addIndex(
    'oauth_codes',
    ['client_id', 'consumed', 'expires_at'],
    {
      name: 'idx_code_validate_cleanup'
    }
  );

  // 3. oauth_tokens - 刷新令牌表
  await queryInterface.createTable('oauth_tokens', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '自增主键'
    },
    refresh_token: {
      type: Sequelize.STRING(255),
      unique: true,
      allowNull: false,
      comment: '刷新令牌值'
    },
    sub: {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: '令牌所属主体 ID'
    },
    client_id: {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: '关联的客户端 ID'
    },
    scope: {
      type: Sequelize.STRING(500),
      comment: '授权的权限范围'
    },
    revoked: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      comment: '是否已吊销'
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: false,
      comment: '过期时间'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });

  await queryInterface.addIndex('oauth_tokens', ['client_id'], {
    name: 'idx_token_client'
  });
  await queryInterface.addIndex('oauth_tokens', ['expires_at'], {
    name: 'idx_token_expires'
  });
  await queryInterface.addIndex(
    'oauth_tokens',
    ['sub', 'client_id', 'revoked'],
    { name: 'idx_token_validation' }
  );
  await queryInterface.addIndex('oauth_tokens', ['revoked', 'expires_at'], {
    name: 'idx_token_cleanup'
  });

  // 4. oauth_user_approval - 应用授权记录表
  await queryInterface.createTable('oauth_user_approval', {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    sub: {
      type: Sequelize.UUID,
      allowNull: false,
      comment: '受权主体用户 ID (sub claim)'
    },
    app_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: '应用唯一标识'
    },
    scopes: {
      type: Sequelize.JSON,
      defaultValue: [],
      comment: '授权的权限范围(JSON数组)'
    },
    status: {
      type: Sequelize.TINYINT,
      defaultValue: 1,
      comment: '状态: 1-正常, 0-已撤销/封禁'
    },
    last_auth_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: '最后授权时间'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });

  await queryInterface.addIndex('oauth_user_approval', ['sub', 'app_id'], {
    unique: true,
    name: 'uk_approval_sub_app'
  });

  // 5. oauth_consents - 用户授权同意记录表
  await queryInterface.createTable('oauth_consents', {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '自增主键'
    },
    sub: {
      type: Sequelize.UUID,
      allowNull: false,
      comment: '受权主体用户 ID (sub claim)'
    },
    client_id: {
      type: Sequelize.STRING(128),
      allowNull: false,
      comment: '客户端唯一标识'
    },
    scopes: {
      type: Sequelize.JSON,
      defaultValue: [],
      comment: '已授权的权限范围列表'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      )
    }
  });

  await queryInterface.addIndex('oauth_consents', ['sub', 'client_id'], {
    unique: true,
    name: 'uk_sub_client'
  });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('oauth_consents');
  await queryInterface.dropTable('oauth_user_approval');
  await queryInterface.dropTable('oauth_tokens');
  await queryInterface.dropTable('oauth_codes');
  await queryInterface.dropTable('oauth_clients');
}
