/**
 * PoseCraft 用户点赞模型
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} UserLike 模型
 */
export default (sequelize, DataTypes) => {
  const UserLike = sequelize.define(
    'UserLike',
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
        comment: '点赞的作品ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'template_id',
        comment: '点赞的模板ID'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_user_like',
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'work_id', 'delete_version'],
          name: 'uk_user_like_work'
        },
        {
          unique: true,
          fields: ['user_id', 'template_id', 'delete_version'],
          name: 'uk_user_like_template'
        }
      ],
      comment: 'PoseCraft 用户点赞表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  UserLike.associate = models => {
    UserLike.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserLike.belongsTo(models.Work, { foreignKey: 'work_id', as: 'work' });
    UserLike.belongsTo(models.Template, { foreignKey: 'template_id', as: 'template' });
  };

  return UserLike;
};
