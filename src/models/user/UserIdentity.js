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
      // --- 下方为大企业必备的风控与审计字段 ---
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
          fields: ['identity_type', 'identifier', 'deletedAt'],
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
      as: 'user'
    });
  };

  return UserIdentity;
};
