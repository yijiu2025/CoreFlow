/**
 * OAuth 2.1 授权码模型
 *
 * 存储授权码流程中颁发的一次性授权码。
 * 每个授权码关联一个客户端和用户，消费后标记为已使用。
 */
export default (sequelize, DataTypes) => {
  const OauthCode = sequelize.define(
    'OauthCode',
    {
      /** 授权码值，随机生成的唯一字符串 */
      code: {
        type: DataTypes.STRING(128),
        primaryKey: true,
        comment: '授权码值'
      },
      /** 关联的客户端 ID */
      client_id: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '关联的客户端 ID'
      },
      /**
       * 授权码所属用户的 ID（sub claim）
       * 物理对齐：类型修改为 UUID 以对齐 User.uid 并支持高效联表与外键级联
       */
      sub: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: '用户唯一标识（sub claim）'
      },
      /** 回调地址，必须与客户端注册的一致 */
      redirect_uri: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '回调地址'
      },
      /** 授权的权限范围 */
      scope: {
        type: DataTypes.STRING(500),
        comment: '授权的权限范围'
      },
      /** PKCE code_challenge 值 */
      code_challenge: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: 'PKCE code_challenge 值'
      },
      /** PKCE code_challenge_method，通常为 S256 */
      code_challenge_method: {
        type: DataTypes.STRING(10),
        defaultValue: 'S256',
        comment: 'PKCE code_challenge_method'
      },
      /** OIDC nonce 值，用于防止重放攻击 */
      nonce: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: 'OIDC nonce 值'
      },
      /** 是否已被消费（一次性使用） */
      consumed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否已被消费'
      },
      /** 过期时间 */
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '过期时间'
      }
    },
    {
      tableName: 'oauth_codes',
      timestamps: true,
      indexes: [
        {
          fields: ['client_id', 'consumed', 'expires_at'],
          name: 'idx_code_validate_cleanup',
          comment: '授权码校验与定期清理辅助复合索引'
        }
      ],
      comment: 'OAuth 2.1 授权码表'
    }
  );

  OauthCode.associate = (models) => {
    // 建立与 User 模型的关联关联关系 (基于 sub -> User.uid)
    OauthCode.belongsTo(models.User, {
      foreignKey: 'sub',
      targetKey: 'uid',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return OauthCode;
};
