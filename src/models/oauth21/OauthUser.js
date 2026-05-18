/**
 * OAuth 2.1 用户模型
 *
 * 存储 OAuth 子系统的用户信息。
 * 与主系统 User 模型独立，适用于 OAuth 2.1 授权服务器场景。
 *
 * 示例数据：
 * {
 *   id: 'uuid-xxx',
 *   username: 'alice',
 *   password: '$2a$12$...',          // bcrypt 哈希
 *   email: 'alice@example.com',
 *   name: 'Alice Wang'
 * }
 */
export default (sequelize, DataTypes) => {
  const OauthUser = sequelize.define(
    'OauthUser',
    {
      /** 用户唯一标识（UUID） */
      id: {
        type: DataTypes.STRING(36),
        primaryKey: true,
        comment: '用户唯一标识（UUID）'
      },
      /** 用户名，用于登录 */
      username: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        comment: '用户名'
      },
      /** 密码哈希值（bcrypt） */
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '密码哈希值（bcrypt）'
      },
      /** 邮箱地址 */
      email: {
        type: DataTypes.STRING(100),
        validate: { isEmail: true },
        comment: '邮箱地址'
      },
      /** 用户显示名称 */
      name: {
        type: DataTypes.STRING(100),
        comment: '用户显示名称'
      }
    },
    {
      tableName: 'oauth_users',
      timestamps: true,
      comment: 'OAuth 2.1 用户表'
    }
  );

  return OauthUser;
};
