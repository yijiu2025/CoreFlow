/**
 * PoseCraft 用户访问历史记录模型
 */
export default (sequelize, DataTypes) => {
  const UserHistory = sequelize.define(
    'UserHistory',
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
        comment: '访问的作品ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'template_id',
        comment: '访问的模板ID'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_user_history',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id', 'created_at'], name: 'idx_user_history_user_created' }
      ],
      comment: 'PoseCraft 用户访问历史表'
    }
  );

  UserHistory.associate = (models) => {
    UserHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserHistory.belongsTo(models.Work, { foreignKey: 'work_id', as: 'work' });
    UserHistory.belongsTo(models.Template, { foreignKey: 'template_id', as: 'template' });
  };

  return UserHistory;
};
