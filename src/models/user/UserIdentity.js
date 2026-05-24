import { registerDeleteVersionHooks } from '../../utils/softDeleteHooks.js';

/**
 * 工业级用户安全凭证模型 (多源认证中心)
 */
export default (sequelize, DataTypes) => {
  const UserIdentity = sequelize.define(
    'UserIdentity',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '关联底层 users 表主键'
      },
      identity_type: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: '认证类型: password, wechat, github, phone_sms 等'
      },
      identifier: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: '认证标识: 登录名 / 邮箱号 / 手机号 / 微信 OpenID'
      },
      credential: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '安全凭证: 密码 bcrypt Hash 值 / 三方 Token'
      },
      failed_attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '连续鉴权失败次数 (用于防爆破)'
      },
      locked_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '账号风控锁定截止时间'
      },
      last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '该凭证最后一次成功登录的时间'
      },
      /**
       * 软删除版本标志 (解决 MySQL 唯一约束与 NULL 值的冲突漏洞)
       * 0: 表示活跃记录 (正常状态)
       * 非0 (自增 ID): 表示已软删除的记录，保证正常状态下的唯一约束不会被 NULL 值穿透
       */
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '软删除版本标志 (0为活跃，非0表示已删除，解决唯一索引对 NULL 的失效问题)'
      }
    },
    {
      tableName: 'user_identity',
      timestamps: true,
      paranoid: true, // 开启软删除
      comment: '统一用户认证与安全凭证表',
      indexes: [
        {
          unique: true,
          fields: ['identity_type', 'identifier', 'delete_version'],
          name: 'uk_identity_type_identifier'
        },
        {
          fields: ['user_id'],
          name: 'idx_user_id'
        }
      ]
    }
  );

  UserIdentity.associate = (models) => {
    UserIdentity.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  // 🔐 注册软删除防 NULL 穿透生命周期钩子
  registerDeleteVersionHooks(UserIdentity);

  return UserIdentity;
};
