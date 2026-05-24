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
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '权限名称'
      },
      module: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '所属模块'
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '操作编码'
      },
      appId: {
        type: DataTypes.STRING(100),
        field: 'app_id',
        allowNull: false,
        comment: '所属应用ID'
      }
    },
    {
      tableName: 'permissions',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['app_id', 'module', 'action'],
          name: 'uk_app_module_action'
        }
      ],
      comment: '应用权限明细表'
    }
  );

  return Permission;
};
