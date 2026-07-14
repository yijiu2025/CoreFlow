/**
 * PoseCraft 模板模型
 * 存储姿势模板
 *
 * @author Claude
 * @since 2026-07-13
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Template 模型
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
        defaultValue: 'pose',
        comment: '分类: pose, creative, sports, composition, technique, custom'
      },
      image_url: {
        type: DataTypes.STRING(500),
        field: 'image_url',
        comment: '原图 URL'
      },
      thumbnail_url: {
        type: DataTypes.STRING(500),
        field: 'thumbnail_url',
        comment: '骨架预览图 URL（透明背景 PNG），后端生成'
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
        defaultValue: 2, // 默认值为 2-待审核，待管理员审核通过后改为 1-公开
        comment: '状态: 2-待审核, 1-公开, 0-私密, -1-已删除, -2-审核拒绝'
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
      work_id: {
        type: DataTypes.BIGINT,
        field: 'work_id',
        comment: '该模板对应的底图作品 ID（一对一绑定）'
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
        { fields: ['status'], name: 'idx_template_status' },
        { fields: ['work_id'], name: 'idx_template_work' }
      ],
      comment: 'PoseCraft 模板表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Template.associate = (models) => {
    Template.belongsTo(models.User, { foreignKey: 'user_id', as: 'creator' });
    // 模板一对一绑定底图作品（反向指针）
    Template.hasOne(models.Work, { foreignKey: 'template_id', as: 'templateWork' });
  };

  return Template;
};
