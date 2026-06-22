/**
 * PoseCraft 模板数据访问层
 */
import sequelize from '../../../db/index.js';

class TemplateDao {
  getModel() {
    return sequelize.models.Template;
  }

  /**
   * 查询模板列表
   */
  async findAll(options = {}) {
    const model = this.getModel();
    const { Op } = await import('sequelize');

    const where = { status: 1, delete_version: 0 };

    if (options.category) {
      where.category = options.category;
    }

    if (options.userId) {
      where.user_id = options.userId;
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
   * 查询热门模板
   */
  async findPopular(limit = 10) {
    const model = this.getModel();
    return await model.findAll({
      where: { status: 1, delete_version: 0 },
      order: [['uses_count', 'DESC']],
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
   * 创建模板
   */
  async create(data) {
    const model = this.getModel();
    return await model.create(data);
  }

  /**
   * 更新模板
   */
  async update(id, data) {
    const model = this.getModel();
    const template = await this.findById(id);
    if (!template) return null;
    return await template.update(data);
  }

  /**
   * 删除模板（软删除）
   */
  async delete(id, userId) {
    const model = this.getModel();
    const template = await this.findById(id);
    if (!template || template.user_id !== userId) return false;
    await template.update({ delete_version: id });
    return true;
  }

  /**
   * 增加使用次数
   */
  async incrementUses(id) {
    const model = this.getModel();
    await model.increment('uses_count', { where: { id } });
  }

  /**
   * 增加点赞数
   */
  async incrementLikes(id) {
    const model = this.getModel();
    await model.increment('likes_count', { where: { id } });
  }
}

export default new TemplateDao();
