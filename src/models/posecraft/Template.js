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
      // ── 发布地址（自动采集，不可修改）──
      publication_address: {
        type: DataTypes.STRING(500),
        field: 'publication_address',
        comment: '发布地址文本（GPS/IP 自动获取）'
      },
      publication_lat: {
        type: DataTypes.DECIMAL(10, 7),
        field: 'publication_lat',
        comment: '发布地址纬度'
      },
      publication_lng: {
        type: DataTypes.DECIMAL(10, 7),
        field: 'publication_lng',
        comment: '发布地址经度'
      },
      publication_source: {
        type: DataTypes.ENUM('gps', 'ip'),
        field: 'publication_source',
        comment: '发布地址来源：gps=GPS定位 ip=IP定位'
      },
      // ── 作品地址（EXIF GPS 或 用户手动选择）──
      work_address: {
        type: DataTypes.STRING(500),
        field: 'work_address',
        comment: '作品地址文本（EXIF GPS 或手动选择）'
      },
      work_lat: {
        type: DataTypes.DECIMAL(10, 7),
        field: 'work_lat',
        comment: '作品地址纬度'
      },
      work_lng: {
        type: DataTypes.DECIMAL(10, 7),
        field: 'work_lng',
        comment: '作品地址经度'
      },
      work_address_source: {
        type: DataTypes.ENUM('exif', 'manual'),
        field: 'work_address_source',
        comment: '作品地址来源：exif=照片GPS manual=用户选择'
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
