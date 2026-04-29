/**
 * 用户与分组关联模型
 */
export default (sequelize, DataTypes) => {
  return sequelize.define(
    'UserGroup',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      uid: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      group_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: 'user_group_links',
      timestamps: false,
      indexes: [{ unique: true, fields: ['uid', 'group_id'] }]
    }
  );
};
