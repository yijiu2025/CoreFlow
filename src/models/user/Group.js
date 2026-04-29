/**
 * 用户分组模型 (Role/Group)
 */
export default (sequelize, DataTypes) => {
  const Group = sequelize.define(
    'Group',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING(60),
        allowNull: false,
        unique: true,
        comment: '分组名称'
      },
      info: {
        type: DataTypes.STRING(255),
        comment: '分组描述'
      },
      level: {
        type: DataTypes.TINYINT,
        defaultValue: 3,
        comment: '1:Root, 2:Guest, 3:User'
      }
    },
    {
      tableName: 'groups',
      timestamps: true
    }
  );

  Group.associate = (models) => {
    // 分组与用户的多对多关系
    Group.belongsToMany(models.User, {
      through: models.UserGroup,
      foreignKey: 'group_id',
      otherKey: 'uid',
      as: 'users'
    });
    // 分组与权限的多对多关系
    Group.belongsToMany(models.Permission, {
      through: models.GroupPermission,
      foreignKey: 'group_id',
      otherKey: 'permission_id',
      as: 'permissions'
    });
  };

  return Group;
};
