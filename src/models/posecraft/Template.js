/**
 * PoseCraft 模板模型
 * 存储姿势模板
 */
export default (sequelize, DataTypes) => {
  const Template = sequelize.define(
    'Template',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '模板标题'
      },
      description: {
        type: DataTypes.TEXT,
        comment: '模板描述'
      },
      category: {
        type: DataTypes.STRING(50),
        defaultValue: 'general',
        comment: '分类: general, dance, yoga, sports, custom'
      },
      thumbnail_url: {
        type: DataTypes.STRING(500),
        field: 'thumbnail_url',
        comment: '缩略图 URL'
      },
      image_url: {
        type: DataTypes.STRING(500),
        field: 'image_url',
        comment: '原图 URL'
      },
      pose_data: {
        type: DataTypes.JSON,
        field: 'pose_data',
        comment: '姿势关键点数据 (JSON)'
      },
      tags: {
        type: DataTypes.JSON,
        comment: '标签数组'
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'user_id',
        comment: '创建者 ID'
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
      uses_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'uses_count',
        comment: '使用次数'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'posecraft_template',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_template_user' },
        { fields: ['category'], name: 'idx_template_category' },
        { fields: ['status'], name: 'idx_template_status' }
      ],
      comment: 'PoseCraft 模板表'
    }
  );

  Template.associate = (models) => {
    Template.belongsTo(models.User, { foreignKey: 'user_id', as: 'creator' });
    Template.hasMany(models.Work, { foreignKey: 'template_id', as: 'works' });
  };

  return Template;
};
