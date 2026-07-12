/**
 * PoseCraft 推荐数据访问层
 */
import sequelize from '../../../db/index.js';

class RecommendationDao {
  getModel() {
    return sequelize.models.Recommendation;
  }

  /**
   * 创建推荐（用户推荐某个作品/模板给朋友看）
   * 重复推荐同一内容幂等：返回已有记录
   */
  async create(userId, { workId, templateId } = {}) {
    const Model = this.getModel();
    const where = {
      user_id: userId,
      delete_version: 0,
      work_id: workId || null,
      template_id: templateId || null
    };

    const existing = await Model.findOne({ where });
    if (existing) return existing;

    return await Model.create({ ...where });
  }

  /**
   * 取消推荐（软删除）
   */
  async cancel(userId, { workId, templateId } = {}) {
    const Model = this.getModel();
    const record = await Model.findOne({
      where: {
        user_id: userId,
        delete_version: 0,
        work_id: workId || null,
        template_id: templateId || null
      }
    });
    if (!record) return false;
    await record.update({ delete_version: record.id });
    await record.destroy();
    return true;
  }

  /**
   * 检查当前用户是否已推荐某内容
   */
  async checkStatus(userId, { workId, templateId } = {}) {
    const Model = this.getModel();
    const count = await Model.count({
      where: {
        user_id: userId,
        delete_version: 0,
        work_id: workId || null,
        template_id: templateId || null
      }
    });
    return count > 0;
  }

  /**
   * 分页查询我推荐的内容（"我的→推荐"Tab）
   */
  async findMyRecommendations(userId, { page = 1, pageSize = 20 } = {}) {
    const Model = this.getModel();
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Model.findAndCountAll({
      where: { user_id: userId, delete_version: 0 },
      include: [
        { model: sequelize.models.Work, as: 'work', required: false, where: { delete_version: 0 }, attributes: ['id', 'title', 'description', 'image_url', 'thumbnail_url', 'likes_count', 'is_template_work', 'created_at'] },
        { model: sequelize.models.Template, as: 'template', required: false, where: { delete_version: 0 }, attributes: ['id', 'title', 'description', 'image_url', 'thumbnail_url', 'category', 'created_at'] }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    // 扁平化：统一为 { id, type, work_id/template_id, title, description, image_url, thumbnail_url, ... }
    const list = rows.map((r) => {
      const data = r.toJSON();
      if (data.work) {
        return { id: data.id, type: 'work', target_id: data.work.id, title: data.work.title, description: data.work.description, image_url: data.work.image_url, thumbnail_url: data.work.thumbnail_url, likes_count: data.work.likes_count, created_at: data.created_at, recommended_at: data.created_at };
      }
      if (data.template) {
        return { id: data.id, type: 'template', target_id: data.template.id, title: data.template.title, description: data.template.description, image_url: data.template.image_url, thumbnail_url: data.template.thumbnail_url, category: data.template.category, created_at: data.template.created_at, recommended_at: data.created_at };
      }
      return null;
    }).filter(Boolean);

    return { list, total: count, page, pageSize };
  }

  /**
   * 获取推荐数量
   */
  async getCount(userId) {
    const Model = this.getModel();
    return await Model.count({ where: { user_id: userId, delete_version: 0 } });
  }
}

export default new RecommendationDao();
