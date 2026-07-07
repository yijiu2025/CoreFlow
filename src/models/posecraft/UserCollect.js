/**
 * PoseCraft 用户收藏模型
 */
export default (sequelize, DataTypes) => {
  const UserCollect = sequelize.define(
    'UserCollect',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
        comment: '用户ID'
      },
      work_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'work_id',
        comment: '收藏的作品ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'template_id',
        comment: '收藏的模板ID'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_user_collect',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'work_id', 'delete_version'],
          name: 'uk_user_collect_work'
        },
        {
          unique: true,
          fields: ['user_id', 'template_id', 'delete_version'],
          name: 'uk_user_collect_template'
        }
      ],
      comment: 'PoseCraft 用户收藏表'
    }
  );

  UserCollect.associate = (models) => {
    UserCollect.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserCollect.belongsTo(models.Work, { foreignKey: 'work_id', as: 'work' });
    UserCollect.belongsTo(models.Template, { foreignKey: 'template_id', as: 'template' });
  };

  return UserCollect;
};
