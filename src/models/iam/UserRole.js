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
        comment: '被授权的用户ID (关联 user_user.id)'
      },
      role_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '分配的角色ID (关联 user_role.id)'
      },
      app_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'GLOBAL',
        comment: '应用标识 (冗余设计，极大加速按应用维度的权限拉取)'
      },
      expire_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '角色过期时间 (用于 JIT 临时提权，过期自动失效)'
      },
      // === 安全审计维度 ===
      granted_by: {
        type: DataTypes.BIGINT,
        allowNull: true, // 系统自动分配的可以是 null
        comment: '授权人ID (记录是谁分配了这个角色，用于安全审计)'
      }
    },
    {
      tableName: 'user_app_user_role', // 建议改用下划线命名法
      timestamps: true,
      paranoid: true, // 【关键】开启软删除。记录被剥夺的角色历史
      comment: '用户角色授权关系表',
      indexes: [
        {
          // 唯一约束：同一个人不能被重复分配同一个角色
          unique: true,
          fields: ['user_id', 'role_id', 'deletedAt'],
          name: 'uk_user_role'
        },
        {
          // 【性能核心】：加速登录时的权限拉取 (WHERE user_id = ? AND app_id = ?)
          fields: ['user_id', 'app_id'],
          name: 'idx_user_app'
        },
        {
          // 加速定时任务清理或统计过期权限 (WHERE expire_at < NOW())
          fields: ['expire_at'],
          name: 'idx_expire_at'
        }
      ]
    }
  );

  UserRole.associate = (models) => {
    UserRole.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserRole.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
    UserRole.belongsTo(models.User, { foreignKey: 'granted_by', as: 'grantor' }); // 关联授权人
  };

  return UserRole;
};
