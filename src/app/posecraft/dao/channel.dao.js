/**
 * PoseCraft 频道配置数据访问层
 * 负责首页频道 Tab 的增删改查，支持按展示窗口过滤
 *
 * @author Claude
 * @since 2026-07-16
 */
import { getModel } from '../../../db/index.js';

class ChannelDao {
  /**
   * 获取 Channel 模型
   * @returns {Model}
   */
  getModel() {
    return getModel('Channel');
  }

  /**
   * 前台：取当前在展示窗口内、启用的频道
   * 自动过滤：enabled=1、未软删、start_at<=now、end_at>=now
   * @param {Date} now - 当前时间（默认 new Date()）
   * @returns {Promise<Array<Channel>>}
   */
  async findActive(now = new Date()) {
    const model = this.getModel();
    const { Op } = await import('sequelize');
    return await model.findAll({
      where: {
        enabled: true,
        delete_version: 0,
        [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }],
        [Op.or]: [{ end_at: null }, { end_at: { [Op.gte]: now } }]
      },
      order: [
        ['sort_order', 'DESC'],
        ['created_at', 'ASC']
      ]
    });
  }

  /**
   * 管理台：分页查询所有未软删的频道
   * @param {object} [options] - { limit, offset }
   * @returns {Promise<{list: Array, total: number}>}
   */
  async findAll({ limit = 20, offset = 0 } = {}) {
    const model = this.getModel();
    const { count, rows } = await model.findAndCountAll({
      where: { delete_version: 0 },
      order: [
        ['sort_order', 'DESC'],
        ['created_at', 'ASC']
      ],
      limit,
      offset
    });
    return { list: rows, total: count };
  }

  /**
   * 根据 ID 查询（未软删）
   * @param {number} id
   * @returns {Promise<Channel|null>}
   */
  async findById(id) {
    const model = this.getModel();
    return await model.findOne({ where: { id, delete_version: 0 } });
  }

  /**
   * 根据 value 查询
   * @param {string} value
   * @returns {Promise<Channel|null>}
   */
  async findByValue(value) {
    const model = this.getModel();
    return await model.findOne({ where: { value, delete_version: 0 } });
  }

  /**
   * 创建频道
   * @param {object} data
   * @returns {Promise<Channel>}
   */
  async create(data) {
    const model = this.getModel();
    return await model.create({ ...data, delete_version: 0 });
  }

  /**
   * 更新频道
   * @param {number} id
   * @param {object} data
   * @returns {Promise<Channel|null>}
   */
  async update(id, data) {
    const model = this.getModel();
    const item = await this.findById(id);
    if (!item) return null;
    return await item.update(data);
  }

  /**
   * 软删除频道
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const model = this.getModel();
    const item = await this.findById(id);
    if (!item) return false;
    await item.update({ delete_version: id });
    return true;
  }
}

export default new ChannelDao();
