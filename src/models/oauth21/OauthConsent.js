/**
 * OAuth 2.1 用户授权同意记录模型
 *
 * 记录用户对某个客户端的授权同意信息。
 * 遵循 OIDC 规范，将用户外部标识字段统一命名为 sub，类型保持 STRING(128)，存储主系统的 User.uid。
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
      /** 受权主体用户 ID (存储主系统 User.uid) */
      sub: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '受权主体用户 ID (sub claim)'
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
          fields: ['sub', 'client_id'],
          name: 'uk_sub_client'
        }
      ],
      comment: 'OAuth 2.1 用户授权同意记录表'
    }
  );

  return OauthConsent;
};
