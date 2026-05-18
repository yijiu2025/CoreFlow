/**
 * OAuth 2.1 客户端模型
 *
 * 存储已注册的 OAuth 客户端信息，包括公共客户端（SPA）和机密客户端（Server App）。
 *
 * 示例数据：
 * {
 *   client_id: 'spa-client-001',
 *   client_name: 'Demo SPA',
 *   client_secret: null,                       // 公共客户端无 secret
 *   redirect_uris: ['http://localhost:8080/callback'],
 *   grant_types: ['authorization_code', 'refresh_token'],
 *   response_types: ['code'],
 *   scope: 'openid profile email',
 *   token_endpoint_auth_method: 'none',        // 公共客户端不认证
 *   application_type: 'web'
 * }
 *
 * {
 *   client_id: 'server-client-001',
 *   client_name: 'Demo Server App',
 *   client_secret: 'demo_server_secret',       // 机密客户端有 secret
 *   redirect_uris: ['http://localhost:9090/callback'],
 *   grant_types: ['authorization_code', 'client_credentials', 'refresh_token'],
 *   response_types: ['code'],
 *   scope: 'openid profile email api:read api:write',
 *   token_endpoint_auth_method: 'client_secret_basic',
 *   application_type: 'web'
 * }
 *
 * {
 *   client_id: 'm2m-client-001',
 *   client_name: 'Machine-to-Machine Service',
 *   client_secret: 'demo_m2m_secret',
 *   redirect_uris: [],
 *   grant_types: ['client_credentials'],
 *   response_types: [],
 *   scope: 'api:read api:write',
 *   token_endpoint_auth_method: 'client_secret_basic',
 *   application_type: 'service'
 * }
 */
export default (sequelize, DataTypes) => {
  const OauthClient = sequelize.define(
    'OauthClient',
    {
      /** 客户端唯一标识，如 'spa-client-001' */
      client_id: {
        type: DataTypes.STRING(128),
        primaryKey: true,
        comment: '客户端唯一标识'
      },
      /** 客户端显示名称 */
      client_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '客户端名称'
      },
      /** 客户端密钥，公共客户端为 null */
      client_secret: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '客户端密钥（公共客户端为 null）'
      },
      /** 允许的回调地址列表，JSON 数组存储 */
      redirect_uris: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: '允许的回调地址列表'
      },
      /** 支持的授权类型：authorization_code / client_credentials / refresh_token / urn:ietf:params:oauth:grant-type:device_code */
      grant_types: {
        type: DataTypes.JSON,
        defaultValue: ['authorization_code'],
        comment: '支持的授权类型列表'
      },
      /** 支持的响应类型 */
      response_types: {
        type: DataTypes.JSON,
        defaultValue: ['code'],
        comment: '支持的响应类型列表'
      },
      /** 允许的权限范围，空格分隔 */
      scope: {
        type: DataTypes.STRING(500),
        defaultValue: 'openid profile',
        comment: '允许的权限范围（空格分隔）'
      },
      /** Token 端点认证方式：none（公共客户端）/ client_secret_basic / client_secret_post */
      token_endpoint_auth_method: {
        type: DataTypes.STRING(50),
        defaultValue: 'none',
        comment: 'Token 端点认证方式'
      },
      /** 应用类型：web / service */
      application_type: {
        type: DataTypes.STRING(20),
        defaultValue: 'web',
        comment: '应用类型：web / service'
      }
    },
    {
      tableName: 'oauth_clients',
      timestamps: true,
      comment: 'OAuth 2.1 客户端注册表'
    }
  );

  return OauthClient;
};
