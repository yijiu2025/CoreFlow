/**
 * 交易数据访问层
 * 提供交易记录的 CRUD 操作
 *
 * @author <作者>
 * @since 2026-07-20
 */
import sequelize from '../../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

class TradeDao {
  /**
   * 获取模型实例
   * @returns {object} Trade 模型
   */
  getModel() {
    return sequelize.models.Trade;
  }

  /**
   * 获取交易记录列表
   * @param {object} options - 查询选项
   * @param {number} options.userId - 用户 ID
   * @param {number} options.type - 交易类型 (1=买入 2=卖出)
   * @param {string} options.startDate - 开始日期
   * @param {string} options.endDate - 结束日期
   * @param {number} options.limit - 限制数量
   * @returns {Promise<object[]>} 交易记录列表
   */
  async findAll(options = {}) {
    const model = this.getModel();
    const { Op } = await import('sequelize');
    const where = { delete_version: 0 };

    if (options.userId) where.user_id = options.userId;
    if (options.type) where.type = options.type;
    if (options.startDate || options.endDate) {
      where.trade_date = {};
      if (options.startDate) where.trade_date[Op.gte] = options.startDate;
      if (options.endDate) where.trade_date[Op.lte] = options.endDate;
    }

    const trades = await model.findAll({
      where,
      include: [
        { model: sequelize.models.Stock, as: 'stock', attributes: ['id', 'code', 'name'] }
      ],
      order: [['trade_date', 'DESC'], ['created_at', 'DESC']],
      limit: options.limit || 50
    });

    return trades;
  }

  /**
   * 根据 ID 获取交易记录
   * @param {number} id - 交易 ID
   * @returns {Promise<object|null>} 交易实例
   */
  async findById(id) {
    const model = this.getModel();
    return await model.findOne({
      where: { id, delete_version: 0 },
      include: [
        { model: sequelize.models.Stock, as: 'stock', attributes: ['id', 'code', 'name'] }
      ]
    });
  }

  /**
   * 创建交易记录
   * @param {object} data - 交易数据
   * @param {number} data.userId - 用户 ID
   * @param {number} data.stockId - 股票 ID
   * @param {number} data.positionId - 持仓 ID
   * @param {number} data.type - 交易类型 (1=买入 2=卖出)
   * @param {number} data.price - 成交价格
   * @param {number} data.quantity - 成交数量
   * @param {number} data.fee - 手续费
   * @param {string} data.tradeDate - 交易日期
   * @param {string} data.note - 备注
   * @returns {Promise<object>} 新创建的交易记录
   */
  async create(data) {
    const model = this.getModel();
    const amount = data.price * data.quantity;
    return await model.create({
      uid: uuidv4(),
      user_id: data.userId,
      stock_id: data.stockId,
      position_id: data.positionId,
      type: data.type,
      price: data.price,
      quantity: data.quantity,
      amount,
      fee: data.fee || 0,
      trade_date: data.tradeDate,
      note: data.note
    });
  }

  /**
   * 获取用户交易统计
   * @param {number} userId - 用户 ID
   * @returns {Promise<object>} 统计数据
   */
  async getStats(userId) {
    const model = this.getModel();
    const { Op } = await import('sequelize');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthTrades = await model.findAll({
      where: {
        user_id: userId,
        trade_date: { [Op.gte]: monthStart },
        delete_version: 0
      }
    });

    return {
      monthTradeCount: monthTrades.length,
      monthBuyCount: monthTrades.filter(t => t.type === 1).length,
      monthSellCount: monthTrades.filter(t => t.type === 2).length
    };
  }
}

export default new TradeDao();
