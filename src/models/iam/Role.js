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
        type: DataTypes.STRING(50),
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
      }
    },
    {
      tableName: 'user_role',
      timestamps: true,
      paranoid: true,
      indexes: [
        { unique: true, fields: ['code', 'app_id', 'deletedAt'] },
        { fields: ['app_id'] }
      ]
    }
  );

  Role.associate = (models) => {
    // 角色属于多个用户 (通过 PBAC 授权表)
    Role.belongsToMany(models.User, {
      through: models.UserRole,
      foreignKey: 'role_id',
      otherKey: 'user_id',
      as: 'users'
    });
  };

  return Role;
};
