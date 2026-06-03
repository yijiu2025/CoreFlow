import { registerDeleteVersionHooks } from '../../db/softDeleteHooks.js';

/**
 * 工业级用户基础信息模型 (User Profile)
 */
export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '内部系统主键 (专用于底层连表，绝不对外暴露)'
      },
      uid: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
        allowNull: false,
        comment: '对外的全局唯一标识 (API 参数、Token Payload)'
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '用户显示昵称/花名'
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: { isEmail: true },
        // 修正：移除了字段级别的 unique: true，改用下方的联合唯一索引 uk_email_delete_version，解决软删除 NULL 值冲突漏洞
        comment: '联系邮箱 (仅用于通知或展示)'
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        // 修正：追加了 phone 唯一性安全防线，改用下方的联合唯一索引 uk_phone_delete_version，保证手机号全局唯一且支持软删除
        comment: '联系手机号 (可用于通知、展示以及安全登录找回密码)'
      },
      avatar: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: '头像链接'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '1:正常, 0:封禁/冻结, -1:已注销'
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
      tableName: 'user_user',
      timestamps: true,
      paranoid: true, // 开启软删除
      comment: '用户基础信息表 (不包含任何认证敏感数据)',
      indexes: [
        {
          fields: ['uid'],
          name: 'idx_uid'
        },
        {
          unique: true,
          fields: ['email', 'delete_version'],
          name: 'uk_email_delete_version',
          comment: '邮箱与删除版本联合唯一索引，防止软删除唯一性失效'
        },
        {
          unique: true,
          fields: ['phone', 'delete_version'],
          name: 'uk_phone_delete_version',
          comment: '手机号与删除版本联合唯一索引，保证手机号全局唯一且支持软删除重用'
        }
      ]
    }
  );

  User.associate = (models) => {
    // 1:N 关联多源身份凭证表 (启用 hooks 以在代码层面级联触发软删除)
    User.hasMany(models.UserIdentity, {
      foreignKey: 'user_id',
      as: 'identities',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      hooks: true
    });

    // 1:1 关联全局会话追踪 (启用 hooks 以在代码层面级联触发删除)
    User.hasOne(models.UserSession, {
      foreignKey: 'user_id',
      as: 'globalSession',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      hooks: true
    });

    // N:N 多对多关联角色 (保留声明式多对多关联)
    User.belongsToMany(models.Role, {
      through: models.UserRole,
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'roles',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    // 1:N 显式关联 UserRole 连接表模型 (启用 hooks 以在代码层面级联软删除 UserRole 并触发其 delete_version 钩子)
    User.hasMany(models.UserRole, {
      foreignKey: 'user_id',
      as: 'userRoles',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      hooks: true
    });

    // 1:N 一对多关联内联策略 (启用 hooks 以在代码层面级联触发软删除)
    User.hasMany(models.InlinePolicy, {
      foreignKey: 'user_id',
      as: 'inlinePolicies',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      hooks: true
    });
  };

  // 🔐 注册软删除防 NULL 穿透生命周期钩子
  registerDeleteVersionHooks(User);

  return User;
};
