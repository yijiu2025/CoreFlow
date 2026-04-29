/**
 * 权限点模型
 */
export default (sequelize, DataTypes) => {
  const Permission = sequelize.define(
    'Permission',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '权限名称'
      },
      module: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '所属模块'
      },
      app_id: {
        type: DataTypes.STRING(50),
        comment: '所属应用ID (用于多应用权限区分)'
      }
    },
    {
      tableName: 'permissions',
      timestamps: false,
      indexes: [{ unique: true, fields: ['name', 'module', 'app_id'] }]
    }
  );

  Permission.associate = (models) => {
    Permission.belongsToMany(models.Group, {
      through: models.GroupPermission,
      foreignKey: 'permission_id',
      otherKey: 'group_id'
    });
  };

  return Permission;
};
