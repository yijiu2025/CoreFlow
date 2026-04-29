export default (sequelize, DataTypes) => {
  return sequelize.define('Rbac', {
    uid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: false },
    app_id: {
      type: DataTypes.STRING,
      primaryKey: true
    }, // 应用唯一标识，如 'crm', 'oa', 'mall'
    roles: { type: DataTypes.JSON }, // 该用户在该应用下的角色
    permissions: { type: DataTypes.JSON } // 该用户在该应用下的权限点
  });
};
