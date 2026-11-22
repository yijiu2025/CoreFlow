/**
 * 个人 API 令牌模型
 *
 * 用途：给脚本 / 第三方工具发一张「代表本人」的长期凭据。
 * 与登录会话的区别：会话由浏览器 Cookie 承载，令牌是给程序用的 Bearer；
 * 与 `user_identity.credential` 的区别：那里是登录凭证（密码），这里是可随时吊销的派生凭据。
 *
 * 安全约束（都是硬要求）：
 * - 明文只在签发响应里出现一次，库里只存 `sha256` 十六进制（64 字符）；
 * - `prefix` 只存明文前 12 字符，仅用于界面识别「是哪一串」，不能反推出完整令牌；
 * - 吊销是软删除（写 `revoked_at`），保留记录便于排查"这串令牌什么时候没的"。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
const defineUserApiToken = (sequelize, DataTypes) => {
  const UserApiToken = sequelize.define(
    'UserApiToken',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所属用户 user_user.id（个人接口只按它过滤）'
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '令牌用途名称（用户自己填，便于区分脚本/工具）'
      },
      prefix: {
        type: DataTypes.STRING(12),
        allowNull: false,
        comment: '明文前 12 字符（只用于界面识别，不参与校验）'
      },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'sha256(明文) 十六进制；明文绝不落库'
      },
      scopes: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: '令牌作用域（来自 oauth21 scope 注册表的 id 列表）'
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最近一次校验通过的时间（为空表示签发后从未使用）'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '失效时间；NULL 表示不过期'
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '吊销时间；非空即不可再用（软删除）'
      }
    },
    {
      tableName: 'user_api_tokens',
      timestamps: true,
      underscored: true,
      comment: '个人 API 令牌（只存哈希，明文仅签发时展示一次）',
      indexes: [
        { name: 'idx_user_api_tokens_user', fields: ['user_id'] },
        { name: 'idx_user_api_tokens_prefix', fields: ['prefix'] },
        { name: 'uk_user_api_tokens_hash', unique: true, fields: ['token_hash'] }
      ]
    }
  );

  return UserApiToken;
};

export default defineUserApiToken;
