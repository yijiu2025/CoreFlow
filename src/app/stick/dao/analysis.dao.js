/**
 * AI 分析数据访问层
 * 提供分析结果的存储和查询
 *
 * @author <作者>
 * @since 2026-07-20
 */
import sequelize from '../../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

class AnalysisDao {
  /**
   * 获取模型实例
   * @returns {object} Analysis 模型
   */
  getModel() {
    return sequelize.models.Analysis;
  }

  /**
   * 获取某只股票的最新分析
   * @param {number} stockId - 股票 ID
   * @returns {Promise<object|null>} 分析实例
   */
  async findLatestByStock(stockId) {
    const model = this.getModel();
    return await model.findOne({
      where: { stock_id: stockId, delete_version: 0 },
      include: [
        { model: sequelize.models.Stock, as: 'stock', attributes: ['id', 'code', 'name', 'market'] }
      ],
      order: [['created_at', 'DESC']]
    });
  }

  /**
   * 根据 ID 获取分析
   * @param {number} id - 分析 ID
   * @returns {Promise<object|null>} 分析实例
   */
  async findById(id) {
    const model = this.getModel();
    return await model.findOne({
      where: { id, delete_version: 0 },
      include: [
        { model: sequelize.models.Stock, as: 'stock', attributes: ['id', 'code', 'name', 'market'] }
      ]
    });
  }

  /**
   * 创建分析记录
   * @param {object} data - 分析数据
   * @param {number} data.stockId - 股票 ID
   * @param {number} data.currentPrice - 当前价格
   * @param {number} data.ma5 - 5日均线
   * @param {number} data.ma10 - 10日均线
   * @param {number} data.ma20 - 20日均线
   * @param {number} data.macd - MACD 值
   * @param {number} data.rsi - RSI 值
   * @param {number} data.suggestion - 建议 (1-5)
   * @param {string} data.reason - 理由
   * @param {number} data.confidence - 置信度
   * @returns {Promise<object>} 新创建的分析记录
   */
  async create(data) {
    const model = this.getModel();
    return await model.create({
      uid: uuidv4(),
      stock_id: data.stockId,
      current_price: data.currentPrice,
      ma5: data.ma5,
      ma10: data.ma10,
      ma20: data.ma20,
      macd: data.macd,
      rsi: data.rsi,
      suggestion: data.suggestion,
      reason: data.reason,
      confidence: data.confidence
    });
  }
}

export default new AnalysisDao();
