import { registerDeleteVersionHooks } from '../../utils/softDeleteHooks.js';

/**
 * 工业级角色定义表 (PBAC 架构)
 */
export default (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      app_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'GLOBAL',
        comment: '所属应用ID，GLOBAL表示全局角色'
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '角色唯一编码 (如 operator)'
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '角色显示名称'
      },
      rank_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: 0, max: 99 },
        comment: '职级权重(0-99)，用于管理权限压制'
      },
      policy: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '角色的标准策略文档 (PBAC 核心)'
      },
      description: {
        type: DataTypes.STRING(255),
        comment: '角色描述'
      },
      /**
       * 软删除版本标志 (解决 MySQL 唯一约束与 NULL 值的冲突漏洞)
       * 0: 表示活跃角色
       * 非0 (自增 ID): 表示已被软删除的角色
       */
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: '软删除版本标志 (0为活跃，非0表示已删除，解决唯一索引对 NULL 的失效问题)'
      }
    },
    {
      tableName: 'iam_role',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ['app_id', 'code', 'delete_version'],
          name: 'uk_role_app_code'
        }
      ],
      comment: '角色定义主表'
    }
  );

  Role.associate = (models) => {
    // 角色属于多个用户 (通过 PBAC 授权表)
    Role.belongsToMany(models.User, {
      through: models.UserRole,
      foreignKey: 'role_id',
      otherKey: 'user_id',
      as: 'users',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    // 1:N 显式关联 UserRole 连接表模型 (启用 hooks 以在代码层面级联软删除 UserRole 并触发其 delete_version 钩子)
    Role.hasMany(models.UserRole, {
      foreignKey: 'role_id',
      as: 'userRoles',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      hooks: true
    });
  };

  // 🔐 注册软删除防 NULL 穿透生命周期钩子
  registerDeleteVersionHooks(Role);

  return Role;
};
