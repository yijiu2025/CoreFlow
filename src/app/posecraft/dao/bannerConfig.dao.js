/**
 * PoseCraft Banner 配置数据访问层
 */
import sequelize from '../../../db/index.js';

class BannerConfigDao {
  getModel() {
    return sequelize.models.BannerConfig;
  }

  /**
   * 前台：取当前在展示窗口内、启用的 Banner
   * 自动过滤：enabled=1、未软删、start_at<=now、end_at>=now
   * @param {Date} now - 当前时间（默认 new Date()）
   * @returns {Promise<Array<BannerConfig>>}
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
        ['created_at', 'DESC']
      ]
    });
  }

  /**
   * 管理台：分页查询所有未软删的 Banner
   */
  async findAll({ limit = 20, offset = 0 } = {}) {
    const model = this.getModel();
    const { count, rows } = await model.findAndCountAll({
      where: { delete_version: 0 },
      order: [
        ['sort_order', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit,
      offset
    });
    return { list: rows, total: count };
  }

  /**
   * 根据 ID 查询（未软删）
   */
  async findById(id) {
    const model = this.getModel();
    return await model.findOne({ where: { id, delete_version: 0 } });
  }

  /**
   * 创建 Banner
   */
  async create(data) {
    const model = this.getModel();
    return await model.create({ ...data, delete_version: 0 });
  }

  /**
   * 更新 Banner
   */
  async update(id, data) {
    const model = this.getModel();
    const item = await this.findById(id);
    if (!item) return null;
    return await item.update(data);
  }

  /**
   * 软删除 Banner
   */
  async delete(id) {
    const model = this.getModel();
    const item = await this.findById(id);
    if (!item) return false;
    await item.update({ delete_version: id });
    return true;
  }
}

export default new BannerConfigDao();
