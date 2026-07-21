/**
 * 股票数据访问层
 * 提供股票的 CRUD 操作
 *
 * @author <作者>
 * @since 2026-07-20
 */
import sequelize from '../../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

class StockDao {
  /**
   * 获取模型实例
   * @returns {object} Stock 模型
   */
  getModel() {
    return sequelize.models.Stock;
  }

  /**
   * 获取股票列表
   * @param {object} options - 查询选项
   * @param {string} options.keyword - 搜索关键词（代码或名称）
   * @param {number} options.page - 页码
   * @param {number} options.pageSize - 每页数量
   * @returns {Promise<object>} 股票列表和总数
   */
  async findAll(options = {}) {
    const model = this.getModel();
    const { Op } = await import('sequelize');
    const where = { delete_version: 0 };

    if (options.keyword) {
      where[Op.or] = [
        { code: { [Op.like]: `%${options.keyword}%` } },
        { name: { [Op.like]: `%${options.keyword}%` } }
      ];
    }

    const page = options.page || 1;
    const pageSize = options.pageSize || 20;

    const { count, rows } = await model.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    return { list: rows, total: count, page, pageSize };
  }

  /**
   * 根据 ID 获取股票
   * @param {number} id - 股票 ID
   * @returns {Promise<object|null>} 股票实例
   */
  async findById(id) {
    const model = this.getModel();
    return await model.findOne({
      where: { id, delete_version: 0 }
    });
  }

  /**
   * 根据代码获取股票
   * @param {string} code - 股票代码
   * @returns {Promise<object|null>} 股票实例
   */
  async findByCode(code) {
    const model = this.getModel();
    return await model.findOne({
      where: { code, delete_version: 0 }
    });
  }

  /**
   * 创建股票
   * @param {object} data - 股票数据
   * @param {string} data.code - 股票代码
   * @param {string} data.name - 股票名称
   * @param {number} data.market - 市场
   * @param {string} data.industry - 行业
   * @returns {Promise<object>} 新创建的股票实例
   */
  async create(data) {
    const model = this.getModel();
    return await model.create({
      uid: uuidv4(),
      code: data.code,
      name: data.name,
      market: data.market || 1,
      industry: data.industry
    });
  }

  /**
   * 更新股票
   * @param {number} id - 股票 ID
   * @param {object} data - 更新数据
   * @returns {Promise<object|null>} 更新后的股票实例
   */
  async update(id, data) {
    const record = await this.findById(id);
    if (!record) return null;
    return await record.update(data);
  }

  /**
   * 删除股票（软删除）
   * @param {number} id - 股票 ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(id) {
    const record = await this.findById(id);
    if (!record) return false;
    await record.update({ delete_version: id });
    return true;
  }

  /**
   * 根据代码删除股票（软删除）
   * @param {string} code - 股票代码
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteByCode(code) {
    const model = this.getModel();
    const record = await model.findOne({
      where: { code, delete_version: 0 }
    });
    if (!record) return false;
    await record.update({ delete_version: record.id });
    return true;
  }
}

export default new StockDao();
