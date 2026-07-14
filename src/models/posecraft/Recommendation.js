/**
 * PoseCraft 推荐记录模型
 * 用户浏览别人作品/模板时，点击"推荐"让我的朋友也能看见
 * "我的→推荐"Tab 展示自己推荐过的内容 + 取消推荐
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Recommendation 模型
 */
export default (sequelize, DataTypes) => {
  const Recommendation = sequelize.define(
    'Recommendation',
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
        comment: '推荐者 ID'
      },
      work_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'work_id',
        comment: '推荐的作品 ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        field: 'template_id',
        comment: '推荐的模板 ID'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_recommendation',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id', 'delete_version'], name: 'idx_recommendation_user' },
        { fields: ['work_id', 'delete_version'], name: 'idx_recommendation_work' },
        { fields: ['template_id', 'delete_version'], name: 'idx_recommendation_template' }
      ],
      comment: 'PoseCraft 推荐记录（我的推荐页）'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Recommendation.associate = (models) => {
    Recommendation.belongsTo(models.User, { foreignKey: 'user_id', as: 'recommender' });
    Recommendation.belongsTo(models.Work, { foreignKey: 'work_id', as: 'work' });
    Recommendation.belongsTo(models.Template, { foreignKey: 'template_id', as: 'template' });
  };

  return Recommendation;
};
