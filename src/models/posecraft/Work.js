/**
 * PoseCraft 作品模型
 * 存储用户创作的作品
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Work 模型
 */
export default (sequelize, DataTypes) => {
  const Work = sequelize.define(
    'Work',
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
        comment: '作者 ID'
      },
      template_id: {
        type: DataTypes.BIGINT,
        field: 'template_id',
        comment: '使用的模板 ID'
      },
      title: {
        type: DataTypes.STRING(200),
        comment: '作品标题'
      },
      description: {
        type: DataTypes.TEXT,
        comment: '作品描述'
      },
      image_url: {
        type: DataTypes.STRING(500),
        field: 'image_url',
        comment: '作品图片 URL'
      },
      thumbnail_url: {
        type: DataTypes.STRING(500),
        field: 'thumbnail_url',
        comment: '作品缩略图 URL（默认为 image_url 底图原图）'
      },
      analysis_data: {
        type: DataTypes.JSON,
        field: 'analysis_data',
        comment: 'AI 分析结果数据'
      },
      edit_data: {
        type: DataTypes.JSON,
        field: 'edit_data',
        comment: 'Fabric.js 编辑数据'
      },
      is_template_work: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_template_work',
        comment: '是否为模板底图作品（模板一对一绑定的作品），true 时前端显示「模板」徽章'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 2,
        comment: '状态: 2-待审核, 1-公开, 0-私密, -1-已删除, -2-审核拒绝'
      },
      likes_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'likes_count',
        comment: '点赞数'
      },
      views_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'views_count',
        comment: '浏览数'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_work',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_work_user' },
        { fields: ['template_id'], name: 'idx_work_template' },
        { fields: ['status'], name: 'idx_work_status' },
        { fields: ['created_at'], name: 'idx_work_created' },
        { fields: ['is_template_work'], name: 'idx_work_is_template' }
      ],
      comment: 'PoseCraft 作品表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Work.associate = (models) => {
    Work.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
    Work.belongsTo(models.Template, { foreignKey: 'template_id', as: 'template' });
    // 反向：该作品作为模板底图时，Template.work_id 指向本 Work
    Work.hasOne(models.Template, { foreignKey: 'work_id', as: 'boundTemplate' });
  };

  return Work;
};
