/**
 * PoseCraft 作品模型
 * 存储用户创作的作品
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
        comment: '缩略图 URL'
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
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-公开, 0-私密, -1-已删除'
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
        { fields: ['created_at'], name: 'idx_work_created' }
      ],
      comment: 'PoseCraft 作品表'
    }
  );

  Work.associate = (models) => {
    Work.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
    Work.belongsTo(models.Template, { foreignKey: 'template_id', as: 'template' });
  };

  return Work;
};
