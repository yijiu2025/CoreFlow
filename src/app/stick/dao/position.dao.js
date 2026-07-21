/**
 * 持仓数据访问层
 * 提供持仓的 CRUD 操作和盈亏计算
 *
 * @author <作者>
 * @since 2026-07-20
 */
import sequelize from '../../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

class PositionDao {
  /**
   * 获取模型实例
   * @returns {object} Position 模型
   */
  getModel() {
    return sequelize.models.Position;
  }

  /**
   * 获取用户持仓列表
   * @param {object} options - 查询选项
   * @param {number} options.userId - 用户 ID
   * @param {number} options.status - 持仓状态
   * @returns {Promise<object[]>} 持仓列表
   */
  async findAll(options = {}) {
    const model = this.getModel();
    const where = { delete_version: 0 };

    if (options.userId) where.user_id = options.userId;
    if (options.status !== undefined) where.status = options.status;

    const positions = await model.findAll({
      where,
      include: [
        { model: sequelize.models.Stock, as: 'stock', attributes: ['id', 'code', 'name', 'market'] }
      ],
      order: [['created_at', 'DESC']]
    });

    return positions;
  }

  /**
   * 根据 ID 获取持仓
   * @param {number} id - 持仓 ID
   * @returns {Promise<object|null>} 持仓实例
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
   * 获取用户对某只股票的持仓
   * @param {number} userId - 用户 ID
   * @param {number} stockId - 股票 ID
   * @returns {Promise<object|null>} 持仓实例
   */
  async findByUserAndStock(userId, stockId) {
    const model = this.getModel();
    return await model.findOne({
      where: { user_id: userId, stock_id: stockId, status: 1, delete_version: 0 }
    });
  }

  /**
   * 创建持仓
   * @param {object} data - 持仓数据
   * @param {number} data.userId - 用户 ID
   * @param {number} data.stockId - 股票 ID
   * @param {number} data.quantity - 数量
   * @param {number} data.avgCost - 平均成本
   * @param {number} data.totalCost - 总成本
   * @returns {Promise<object>} 新创建的持仓实例
   */
  async create(data) {
    const model = this.getModel();
    return await model.create({
      uid: uuidv4(),
      user_id: data.userId,
      stock_id: data.stockId,
      quantity: data.quantity,
      avg_cost: data.avgCost,
      total_cost: data.totalCost,
      status: 1
    });
  }

  /**
   * 更新持仓
   * @param {number} id - 持仓 ID
   * @param {object} data - 更新数据
   * @returns {Promise<object|null>} 更新后的持仓实例
   */
  async update(id, data) {
    const record = await this.findById(id);
    if (!record) return null;
    return await record.update(data);
  }

  /**
   * 删除持仓（软删除）
   * @param {number} id - 持仓 ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(id) {
    const record = await this.findById(id);
    if (!record) return false;
    await record.update({ delete_version: id });
    return true;
  }

  /**
   * 获取用户持仓统计
   * @param {number} userId - 用户 ID
   * @returns {Promise<object>} 统计数据
   */
  async getStats(userId) {
    const model = this.getModel();
    const positions = await model.findAll({
      where: { user_id: userId, status: 1, delete_version: 0 }
    });

    let totalCost = 0;
    let totalQuantity = 0;

    for (const pos of positions) {
      totalCost += parseFloat(pos.total_cost);
      totalQuantity += pos.quantity;
    }

    return {
      positionCount: positions.length,
      totalCost,
      totalQuantity
    };
  }
}

export default new PositionDao();
