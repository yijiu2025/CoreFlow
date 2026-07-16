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
        comment: '作品地址来源：exif=照片GPS手动=用户选择'
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
