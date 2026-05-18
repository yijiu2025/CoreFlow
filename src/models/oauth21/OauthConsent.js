/**
 * OAuth 2.1 用户授权同意记录模型
 *
 * 记录用户对某个客户端的授权同意信息。
 * 当用户首次授权后，后续相同 scope 的请求可跳过授权页面。
 *
 * 示例数据：
 * {
 *   id: 1,
 *   user_id: 'user-uuid-xxx',
 *   client_id: 'spa-client-001',
 *   scopes: ['openid', 'profile', 'email']
 * }
 *
 * {
 *   id: 2,
 *   user_id: 'user-uuid-xxx',
 *   client_id: 'server-client-001',
 *   scopes: ['openid', 'profile', 'email', 'api:read', 'api:write']
 * }
 */
export default (sequelize, DataTypes) => {
  const OauthConsent = sequelize.define(
    'OauthConsent',
    {
      /** 自增主键 */
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '自增主键'
      },
      /** 用户唯一标识 */
      user_id: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '用户唯一标识'
      },
      /** 客户端唯一标识 */
      client_id: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '客户端唯一标识'
      },
      /** 已授权的权限范围列表 */
      scopes: {
        type: DataTypes.JSON,
        defaultValue: [],
        comment: '已授权的权限范围列表'
      }
    },
    {
      tableName: 'oauth_consents',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'client_id'],
          name: 'uk_user_client'
        }
      ],
      comment: 'OAuth 2.1 用户授权同意记录表'
    }
  );

  return OauthConsent;
};
