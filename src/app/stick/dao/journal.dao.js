/**
 * 交易日志数据访问层
 * 提供日志的 CRUD 操作
 *
 * @author <作者>
 * @since 2026-07-20
 */
import sequelize from '../../../db/index.js';
import { v4 as uuidv4 } from 'uuid';

class JournalDao {
  /**
   * 获取模型实例
   * @returns {object} Journal 模型
   */
  getModel() {
    return sequelize.models.Journal;
  }

  /**
   * 获取日志列表
   * @param {object} options - 查询选项
   * @param {number} options.userId - 用户 ID
   * @param {number} options.stockId - 股票 ID
   * @param {number} options.limit - 限制数量
   * @returns {Promise<object[]>} 日志列表
   */
  async findAll(options = {}) {
    const model = this.getModel();
    const where = { delete_version: 0 };

    if (options.userId) where.user_id = options.userId;
    if (options.stockId) where.stock_id = options.stockId;

    const journals = await model.findAll({
      where,
      include: [
        { model: sequelize.models.Stock, as: 'stock', attributes: ['id', 'code', 'name'] }
      ],
      order: [['created_at', 'DESC']],
      limit: options.limit || 50
    });

    return journals;
  }

  /**
   * 根据 ID 获取日志
   * @param {number} id - 日志 ID
   * @returns {Promise<object|null>} 日志实例
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
   * 创建日志
   * @param {object} data - 日志数据
   * @param {number} data.userId - 用户 ID
   * @param {number} data.stockId - 股票 ID
   * @param {string} data.title - 标题
   * @param {string} data.content - 内容
   * @param {number} data.mood - 心态 (1=乐观 2=中性 3=悲观)
   * @param {string} data.lesson - 经验
   * @returns {Promise<object>} 新创建的日志
   */
  async create(data) {
    const model = this.getModel();
    return await model.create({
      uid: uuidv4(),
      user_id: data.userId,
      stock_id: data.stockId,
      title: data.title,
      content: data.content,
      mood: data.mood || 2,
      lesson: data.lesson
    });
  }

  /**
   * 更新日志
   * @param {number} id - 日志 ID
   * @param {object} data - 更新数据
   * @returns {Promise<object|null>} 更新后的日志
   */
  async update(id, data) {
    const record = await this.findById(id);
    if (!record) return null;
    return await record.update(data);
  }

  /**
   * 删除日志（软删除）
   * @param {number} id - 日志 ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(id) {
    const record = await this.findById(id);
    if (!record) return false;
    await record.update({ delete_version: id });
    return true;
  }
}

export default new JournalDao();
