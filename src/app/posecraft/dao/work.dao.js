/**
 * PoseCraft 作品数据访问层
 */
import sequelize from '../../../db/index.js';

class WorkDao {
  getModel() {
    return sequelize.models.Work;
  }

  /**
   * 查询作品列表
   */
  async findAll(options = {}) {
    const model = this.getModel();
    const { Op } = await import('sequelize');

    const where = { status: 1, delete_version: 0 };

    if (options.userId) {
      where.user_id = options.userId;
    }

    if (options.templateId) {
      where.template_id = options.templateId;
    }

    if (options.keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${options.keyword}%` } },
        { description: { [Op.like]: `%${options.keyword}%` } }
      ];
    }

    return await model.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 20,
      offset: options.offset || 0
    });
  }

  /**
   * 查询用户作品
   */
  async findByUser(userId, options = {}) {
    return await this.findAll({ ...options, userId });
  }

  /**
   * 查询推荐作品
   */
  async findRecommended(limit = 20) {
    const model = this.getModel();
    return await model.findAll({
      where: { status: 1, delete_version: 0 },
      order: [['likes_count', 'DESC'], ['views_count', 'DESC']],
      limit
    });
  }

  /**
   * 根据 ID 查询
   */
  async findById(id) {
    const model = this.getModel();
    return await model.findOne({
      where: { id, delete_version: 0 }
    });
  }

  /**
   * 创建作品
   */
  async create(data) {
    const model = this.getModel();
    return await model.create(data);
  }

  /**
   * 更新作品
   */
  async update(id, data) {
    const model = this.getModel();
    const work = await this.findById(id);
    if (!work) return null;
    return await work.update(data);
  }

  /**
   * 删除作品（软删除）
   */
  async delete(id, userId) {
    const model = this.getModel();
    const work = await this.findById(id);
    if (!work || work.user_id !== userId) return false;
    await work.update({ delete_version: id });
    return true;
  }

  /**
   * 增加浏览量
   */
  async incrementViews(id) {
    const model = this.getModel();
    await model.increment('views_count', { where: { id } });
  }

  /**
   * 增加点赞数
   */
  async incrementLikes(id) {
    const model = this.getModel();
    await model.increment('likes_count', { where: { id } });
  }

  /**
   * 统计用户作品数
   */
  async countByUser(userId) {
    const model = this.getModel();
    return await model.count({
      where: { user_id: userId, delete_version: 0 }
    });
  }
}

export default new WorkDao();
