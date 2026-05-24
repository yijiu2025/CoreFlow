/**
 * OAuth 2.1 刷新令牌模型
 *
 * 存储颁发的刷新令牌，支持令牌轮换和批量吊销。
 * 访问令牌为无状态 JWT，不需要持久化存储。
 *
 * 示例数据：
 * {
 *   id: 1,
 *   refresh_token: 'xYzAbCdEfGhIjKlMnOpQrStUvWxYz...',
 *   sub: 'user-uuid-xxx',
 *   client_id: 'spa-client-001',
 *   scope: 'openid profile email',
 *   revoked: false,
 *   expires_at: '2026-05-08T12:00:00Z'
 * }
 *
 * {
 *   id: 2,
 *   refresh_token: 'm2m-token-xxx...',
 *   sub: 'm2m-client-001',             // M2M 场景下 sub 为 client_id
 *   client_id: 'm2m-client-001',
 *   scope: 'api:read api:write',
 *   revoked: false,
 *   expires_at: '2026-05-08T12:00:00Z'
 * }
 */
export default (sequelize, DataTypes) => {
  const OauthToken = sequelize.define(
    'OauthToken',
    {
      /** 自增主键 */
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '自增主键'
      },
      /** 刷新令牌值，随机生成的唯一字符串 */
      refresh_token: {
        type: DataTypes.STRING(255),
        unique: true,
        allowNull: false,
        comment: '刷新令牌值'
      },
      /** 令牌所属主体的 ID（用户 ID 或客户端 ID） */
      sub: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '令牌所属主体 ID'
      },
      /** 关联的客户端 ID */
      client_id: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '关联的客户端 ID'
      },
      /** 授权的权限范围 */
      scope: {
        type: DataTypes.STRING(500),
        comment: '授权的权限范围'
      },
      /** 是否已吊销 */
      revoked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否已吊销'
      },
      /** 过期时间 */
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间'
      }
    },
    {
      tableName: 'oauth_tokens',
      timestamps: true,
      indexes: [
        { fields: ['client_id'], name: 'idx_token_client' },
        { fields: ['expires_at'], name: 'idx_token_expires' },
        { fields: ['sub', 'client_id', 'revoked'], name: 'idx_token_validation' }, // 刷新令牌校验
        { fields: ['revoked', 'expires_at'], name: 'idx_token_cleanup' } // 定时清理过期/吊销令牌
      ],
      comment: 'OAuth 2.1 刷新令牌表'
    }
  );

  return OauthToken;
};
