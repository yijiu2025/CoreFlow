/**
 * AI 分析结果模型
 * 存储股票的技术分析和建议
 *
 * @author <作者>
 * @since 2026-07-20
 */
/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {Model} Analysis 模型
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
      uid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        comment: 'UUID，对外暴露'
      },
      stock_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'stock_id',
        comment: '关联股票'
      },
      current_price: {
        type: DataTypes.DECIMAL(10, 2),
        field: 'current_price',
        comment: '分析时价格'
      },
      ma5: {
        type: DataTypes.DECIMAL(10, 2),
        comment: '5日均线'
      },
      ma10: {
        type: DataTypes.DECIMAL(10, 2),
        comment: '10日均线'
      },
      ma20: {
        type: DataTypes.DECIMAL(10, 2),
        comment: '20日均线'
      },
      macd: {
        type: DataTypes.DECIMAL(10, 4),
        comment: 'MACD 值'
      },
      rsi: {
        type: DataTypes.DECIMAL(10, 2),
        comment: 'RSI 值'
      },
      suggestion: {
        type: DataTypes.TINYINT,
        comment: '1=强烈买入 2=买入 3=持有 4=卖出 5=强烈卖出'
      },
      reason: {
        type: DataTypes.TEXT,
        comment: '建议理由'
      },
      confidence: {
        type: DataTypes.DECIMAL(3, 2),
        comment: '置信度 (0-1)'
      },
      delete_version: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      tableName: 'stick_analysis',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['stock_id'], name: 'idx_analysis_stock' },
        { fields: ['suggestion'], name: 'idx_analysis_suggestion' },
        { fields: ['created_at'], name: 'idx_analysis_created' }
      ],
      comment: 'AI 分析结果表'
    }
  );

  /**
   * 模型关联定义
   * @param {object} models - 所有已注册模型的集合
   */
  Analysis.associate = (models) => {
    Analysis.belongsTo(models.Stock, { foreignKey: 'stock_id', as: 'stock' });
  };

  return Analysis;
};
