import { registerDeleteVersionHooks } from '../../db/softDeleteHooks.js';

/**
 * 企业级 用户与角色关联表 (授权心脏表)
 */
export default (sequelize, DataTypes) => {
  const UserRole = sequelize.define(
    'UserRole',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '分配的用户ID (关联 user.id)'
      },
      role_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '分配的角色ID (关联 user_role.id)'
      },
      app_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'GLOBAL',
        comment: '应用标识 (冗余设计，极大加速按应用维度的权限拉取)'
      },
      expire_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '角色过期时间 (用于 JIT 临时提权，过期自动失效)'
      },
      granted_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '授权人ID (审计追踪)'
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
      tableName: 'iam_user_role',
      timestamps: true,
      paranoid: true, // 开启软删除
      comment: '用户与角色分配关系表 (核心授权关联)',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'role_id', 'app_id', 'delete_version'],
          name: 'uk_user_role'
        },
        {
          // 【性能核心】：加速登录时的权限拉取与过期检测 (WHERE user_id = ? AND app_id = ? AND expire_at > NOW())
          fields: ['user_id', 'app_id', 'expire_at'],
          name: 'idx_user_app_expire'
        }
      ]
    }
  );

  UserRole.associate = (models) => {
    UserRole.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    UserRole.belongsTo(models.Role, {
      foreignKey: 'role_id',
      as: 'role',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    UserRole.belongsTo(models.User, { 
      foreignKey: 'granted_by', 
      as: 'grantor',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  // 🔐 注册软删除防 NULL 穿透生命周期钩子
  registerDeleteVersionHooks(UserRole);

  return UserRole;
};
