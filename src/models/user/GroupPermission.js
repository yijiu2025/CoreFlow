/**
 * 分组与权限关联模型
 */
export default (sequelize, DataTypes) => {
  return sequelize.define(
    'GroupPermission',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: 'group_permission_links',
      timestamps: false,
      indexes: [{ unique: true, fields: ['group_id', 'permission_id'] }]
    }
  );
};
