/**
 * PoseCraft 分析记录模型
 * 存储 AI 分析历史
 */
export default (sequelize, DataTypes) => {
  const Analysis = sequelize.define(
    'Analysis',
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
        comment: '用户 ID'
      },
      image_url: {
        type: DataTypes.STRING(500),
        field: 'image_url',
        comment: '分析图片 URL'
      },
      analysis_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'analysis_type',
        comment: '分析类型: pose, face, hand, segmentation'
      },
      result_data: {
        type: DataTypes.JSON,
        field: 'result_data',
        comment: '分析结果数据'
      },
      processing_time: {
        type: DataTypes.INTEGER,
        field: 'processing_time',
        comment: '处理耗时 (ms)'
      },
      status: {
        type: DataTypes.TINYINT,
        defaultValue: 1,
        comment: '状态: 1-成功, 0-失败'
      }
    },
    {
      tableName: 'posecraft_analysis',
      timestamps: true,
      indexes: [
        { fields: ['user_id'], name: 'idx_analysis_user' },
        { fields: ['analysis_type'], name: 'idx_analysis_type' },
        { fields: ['created_at'], name: 'idx_analysis_created' }
      ],
      comment: 'PoseCraft 分析记录表'
    }
  );

  Analysis.associate = (models) => {
    Analysis.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Analysis;
};
