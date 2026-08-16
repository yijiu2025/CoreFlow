/**
 * PoseCraft 用户互动数据访问层 (点赞、收藏、历史记录)
 * 负责用户对作品/模板的点赞、收藏、浏览历史记录及相关列表查询
 *
 * @author Claude
 * @since 2026-07-13
 */
import { getModel } from '../../../framework/db/index.js';

class InteractionDao {
  /**
   * 获取 UserLike 模型
   * @returns {Model}
   */
  getLikeModel() {
    return getModel('UserLike');
  }

  /**
   * 获取 UserCollect 模型
   * @returns {Model}
   */
  getCollectModel() {
    return getModel('UserCollect');
  }

  /**
   * 获取 UserHistory 模型
   * @returns {Model}
   */
  getHistoryModel() {
    return getModel('UserHistory');
  }

  /**
   * 获取 Work 模型
   * @returns {Model}
   */
  getWorkModel() {
    return getModel('Work');
  }

  /**
   * 获取 Template 模型
   * @returns {Model}
   */
  getTemplateModel() {
    return getModel('Template');
  }

  /**
   * 记录浏览历史，并递增作品/模板的浏览数；重复浏览仅更新时间戳
   * @param {number} userId - 用户 ID
   * @param {object} payload - { workId?, templateId? }
   * @returns {Promise<boolean>}
   */
  async recordHistory(userId, { workId, templateId }) {
    const History = this.getHistoryModel();
    const Work = this.getWorkModel();
    const Template = this.getTemplateModel();

    const where = { user_id: userId, delete_version: 0 };
    if (workId) {
      where.work_id = workId;
    } else if (templateId) {
      where.template_id = templateId;
    } else {
      return false;
    }

    // 查重：如果有相同的历史记录，则只更新时间戳 (updated_at)
    const existing = await History.findOne({ where });
    if (existing) {
      existing.changed('updatedAt', true);
      await existing.save();
    } else {
      await History.create({
        user_id: userId,
        work_id: workId || null,
        template_id: templateId || null,
        delete_version: 0
      });
    }

    // 递增浏览数
    if (workId) {
      await Work.increment('views_count', { by: 1, where: { id: workId } });
    } else if (templateId) {
      await Template.increment('uses_count', { by: 1, where: { id: templateId } });
    }

    return true;
  }

  /**
   * 切换点赞状态（点赞/取消点赞），联动更新 like 计数
   * @param {number} userId - 用户 ID
   * @param {object} payload - { workId?, templateId?, like: boolean }
   * @returns {Promise<{success: boolean, liked: boolean, message: string}>}
   */
  async toggleLike(userId, { workId, templateId, like }) {
    const Like = this.getLikeModel();
    const Work = this.getWorkModel();
    const Template = this.getTemplateModel();

    const where = { user_id: userId, delete_version: 0 };
    if (workId) {
      where.work_id = workId;
    } else if (templateId) {
      where.template_id = templateId;
    } else {
      return { success: false, message: '无效的参数' };
    }

    const existing = await Like.findOne({ where });

    if (like) {
      if (existing) {
        return { success: true, liked: true, message: '已点赞' };
      }
      // 创建记录
      await Like.create({
        user_id: userId,
        work_id: workId || null,
        template_id: templateId || null,
        delete_version: 0
      });
      // 递增点赞数
      if (workId) {
        await Work.increment('likes_count', { by: 1, where: { id: workId } });
      } else if (templateId) {
        await Template.increment('likes_count', { by: 1, where: { id: templateId } });
      }
      return { success: true, liked: true, message: '点赞成功' };
    } else {
      if (!existing) {
        return { success: true, liked: false, message: '未点赞' };
      }
      // 软删除记录
      await existing.update({ delete_version: existing.id });
      await existing.destroy();
      // 递减点赞数
      if (workId) {
        await Work.increment('likes_count', { by: -1, where: { id: workId } });
      } else if (templateId) {
        await Template.increment('likes_count', { by: -1, where: { id: templateId } });
      }
      return { success: true, liked: false, message: '取消点赞成功' };
    }
  }

  /**
   * 切换收藏状态（收藏/取消收藏）
   * @param {number} userId - 用户 ID
   * @param {object} payload - { workId?, templateId?, collect: boolean }
   * @returns {Promise<{success: boolean, collected: boolean, message: string}>}
   */
  async toggleCollect(userId, { workId, templateId, collect }) {
    const Collect = this.getCollectModel();

    const where = { user_id: userId, delete_version: 0 };
    if (workId) {
      where.work_id = workId;
    } else if (templateId) {
      where.template_id = templateId;
    } else {
      return { success: false, message: '无效的参数' };
    }

    const existing = await Collect.findOne({ where });

    if (collect) {
      if (existing) {
        return { success: true, collected: true, message: '已收藏' };
      }
      await Collect.create({
        user_id: userId,
        work_id: workId || null,
        template_id: templateId || null,
        delete_version: 0
      });
      return { success: true, collected: true, message: '收藏成功' };
    } else {
      if (!existing) {
        return { success: true, collected: false, message: '未收藏' };
      }
      await existing.update({ delete_version: existing.id });
      await existing.destroy();
      return { success: true, collected: false, message: '取消收藏成功' };
    }
  }

  /**
   * 检查当前用户对某作品/模板是否已点赞、已收藏
   * @param {number} userId - 用户 ID
   * @param {object} payload - { workId?, templateId? }
   * @returns {Promise<{liked: boolean, collected: boolean}>}
   */
  async checkStatus(userId, { workId, templateId }) {
    const Like = this.getLikeModel();
    const Collect = this.getCollectModel();

    const where = { user_id: userId, delete_version: 0 };
    if (workId) {
      where.work_id = workId;
    } else if (templateId) {
      where.template_id = templateId;
    } else {
      return { liked: false, collected: false };
    }

    const liked = (await Like.count({ where })) > 0;
    const collected = (await Collect.count({ where })) > 0;

    return { liked, collected };
  }

  /**
   * 分页查询用户的浏览历史记录（扁平化返回，附带作品/模板详情）
   * @param {number} userId - 用户 ID
   * @param {object} [options] - { page, pageSize }
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
   */
  async getHistoryList(userId, { page = 1, pageSize = 20 } = {}) {
    const History = this.getHistoryModel();
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await History.findAndCountAll({
      where: { user_id: userId, delete_version: 0 },
      include: [
        { model: getModel('Work'), as: 'work', required: false, where: { delete_version: 0 } },
        { model: getModel('Template'), as: 'template', required: false, where: { delete_version: 0 } }
      ],
      order: [['updated_at', 'DESC']],
      limit,
      offset
    });

    // 过滤并扁平化返回数据
    const list = rows
      .map(r => {
        if (r.work) {
          return {
            id: r.id,
            type: 'work',
            work_id: r.work.id,
            title: r.work.title,
            description: r.work.description,
            thumbnail_url: r.work.thumbnail_url,
            image_url: r.work.image_url,
            created_at: r.work.created_at,
            viewed_at: r.updated_at
          };
        } else if (r.template) {
          return {
            id: r.id,
            type: 'template',
            template_id: r.template.id,
            title: r.template.title,
            description: r.template.description,
            thumbnail_url: r.template.thumbnail_url,
            image_url: r.template.image_url,
            created_at: r.template.created_at,
            viewed_at: r.updated_at
          };
        }
        return null;
      })
      .filter(Boolean);

    return { list, total: count, page, pageSize };
  }

  /**
   * 分页查询用户点赞列表（扁平化返回）
   * @param {number} userId - 用户 ID
   * @param {object} [options] - { page, pageSize }
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
   */
  async getLikesList(userId, { page = 1, pageSize = 20 } = {}) {
    const Like = this.getLikeModel();
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Like.findAndCountAll({
      where: { user_id: userId, delete_version: 0 },
      include: [
        { model: getModel('Work'), as: 'work', required: false, where: { delete_version: 0 } },
        { model: getModel('Template'), as: 'template', required: false, where: { delete_version: 0 } }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    const list = rows
      .map(r => {
        if (r.work) {
          return {
            id: r.id,
            type: 'work',
            work_id: r.work.id,
            title: r.work.title,
            description: r.work.description,
            thumbnail_url: r.work.thumbnail_url,
            image_url: r.work.image_url,
            likes_count: r.work.likes_count,
            created_at: r.work.created_at,
            liked_at: r.created_at
          };
        } else if (r.template) {
          return {
            id: r.id,
            type: 'template',
            template_id: r.template.id,
            title: r.template.title,
            description: r.template.description,
            thumbnail_url: r.template.thumbnail_url,
            image_url: r.template.image_url,
            likes_count: r.template.likes_count,
            created_at: r.template.created_at,
            liked_at: r.created_at
          };
        }
        return null;
      })
      .filter(Boolean);

    return { list, total: count, page, pageSize };
  }

  /**
   * 分页查询用户收藏列表（扁平化返回）
   * @param {number} userId - 用户 ID
   * @param {object} [options] - { page, pageSize }
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
   */
  async getCollectsList(userId, { page = 1, pageSize = 20 } = {}) {
    const Collect = this.getCollectModel();
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Collect.findAndCountAll({
      where: { user_id: userId, delete_version: 0 },
      include: [
        { model: getModel('Work'), as: 'work', required: false, where: { delete_version: 0 } },
        { model: getModel('Template'), as: 'template', required: false, where: { delete_version: 0 } }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    const list = rows
      .map(r => {
        if (r.work) {
          return {
            id: r.id,
            type: 'work',
            work_id: r.work.id,
            title: r.work.title,
            description: r.work.description,
            thumbnail_url: r.work.thumbnail_url,
            image_url: r.work.image_url,
            likes_count: r.work.likes_count,
            created_at: r.work.created_at,
            collected_at: r.created_at
          };
        } else if (r.template) {
          return {
            id: r.id,
            type: 'template',
            template_id: r.template.id,
            title: r.template.title,
            description: r.template.description,
            thumbnail_url: r.template.thumbnail_url,
            image_url: r.template.image_url,
            likes_count: r.template.likes_count,
            created_at: r.template.created_at,
            collected_at: r.created_at
          };
        }
        return null;
      })
      .filter(Boolean);

    return { list, total: count, page, pageSize };
  }
}

export default new InteractionDao();
