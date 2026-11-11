/**
 * 临时密码模型
 *
 * 管理员为他人签发的一次性登录凭据（排障 / 交接），与用户真实密码**完全独立**：
 * - 只存 bcrypt 哈希，明文仅在生成响应里出现一次，之后无法再读出；
 * - 有失效时间（默认 30 分钟）与可用次数（默认 1 次），用满即作废；
 * - 可手动作废（`revoked_at`），签发人 / 原因 / 使用时间全部留痕。
 *
 * 为什么不复用 `user_identity`（identity_type=password）：
 * 那张表有 `(identity_type, identifier, delete_version)` 唯一索引，临时密码与真实密码
 * 会抢同一个 identifier；而且 `verifyPassword` 读的是它 —— 临时密码一旦写进去就成了
 * **永久密码**，用户本人的密码反而"变了"。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
const defineUserTempPassword = (sequelize, DataTypes) => {
  const UserTempPassword = sequelize.define(
    'UserTempPassword',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '目标用户 user_user.id'
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: '临时密码的 bcrypt 哈希（明文只在生成响应里出现一次）'
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '失效时间'
      },
      max_uses: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '可用次数（默认 1）'
      },
      used_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已用次数'
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最近一次使用时间'
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '手动作废时间（非空即不可再用）'
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '签发人 user_id'
      },
      created_by_name: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '签发人账号快照'
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '签发原因（审计用）'
      }
    },
    {
      tableName: 'user_temp_password',
      timestamps: true,
      underscored: true,
      comment: '临时密码（管理员签发的一次性登录凭据）',
      indexes: [{ name: 'idx_temp_pwd_user', fields: ['user_id', 'expires_at'] }]
    }
  );

  return UserTempPassword;
};

export default defineUserTempPassword;
