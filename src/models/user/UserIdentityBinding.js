/**
 * 第三方账号绑定模型
 *
 * 与 `UserIdentity`（表 `user_identity`）是两件事，**不要合并**：
 * - `user_identity` 是**认证凭证**（密码哈希、锁定次数），登录校验读它；
 * - 本表是**第三方账号绑定**（微信 / GitHub 的 openid 与显示名），用于"个人中心里
 *   查看和解绑第三方账号"，不参与密码登录。
 * 混在一张表里会让"解绑第三方账号"看起来像"删掉了一种登录凭证"，也会撞上
 * `(identity_type, identifier, delete_version)` 唯一索引。
 *
 * 模型名用 `UserIdentityBinding`（不是 `UserIdentity`）：Sequelize 的模型名全局唯一，
 * 复用同名会让后加载的模型覆盖前者，登录链路会静默读到错误的表。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
const defineUserIdentityBinding = (sequelize, DataTypes) => {
  const UserIdentityBinding = sequelize.define(
    'UserIdentityBinding',
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
      provider: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '第三方平台标识（wechat / github / google …）'
      },
      provider_uid: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '第三方平台侧的用户唯一标识（openid / sub）'
      },
      display_name: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: '第三方平台上的显示名（快照，可能为空）'
      }
    },
    {
      tableName: 'user_identities',
      timestamps: true,
      underscored: true,
      comment: '第三方账号绑定（与认证凭证 user_identity 分离）',
      indexes: [
        { name: 'idx_user_identities_user', fields: ['user_id'] },
        // 同一个第三方账号只能绑定到一个本系统用户，避免"一个 openid 两个人用"
        { name: 'uk_user_identities_provider_uid', unique: true, fields: ['provider', 'provider_uid'] }
      ]
    }
  );

  return UserIdentityBinding;
};

export default defineUserIdentityBinding;
