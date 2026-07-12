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

    const page = options.page ? Number(options.page) : (options.limit ? Math.floor((options.offset || 0) / options.limit) + 1 : 1);
    const pageSize = options.pageSize ? Number(options.pageSize) : (options.limit ? Number(options.limit) : 20);
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const { count, rows } = await model.findAndCountAll({
      where,
      include: [{ model: sequelize.models.User, as: 'author', attributes: ['uid', 'username', 'avatar'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      list: rows,
      total: count,
      page,
      pageSize
    };
  }

  /**
   * 查询用户作品
   */
  async findByUser(userId, options = {}) {
    return await this.findAll({ ...options, userId });
  }

  /**
   * 后台：查询审核列表
   */
  async findAuditList(options = {}) {
    const model = this.getModel();
    const { Op } = await import('sequelize');
    
    // 默认查询待审核 (2)，但支持按 status 筛选
    const where = { delete_version: 0 };
    if (options.status !== undefined) {
      where.status = options.status;
    } else {
      where.status = 2; // 默认查待审核
    }
    
    if (options.keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${options.keyword}%` } },
        { description: { [Op.like]: `%${options.keyword}%` } }
      ];
    }
    
    const { count, rows } = await model.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 20,
      offset: options.offset || 0,
      raw: true
    });
    
    return {
      list: rows,
      total: count,
      page: options.page || 1,
      pageSize: options.limit || 20
    };
  }

  /**
   * 后台：更新状态 (审核)
   */
  async updateStatus(id, status) {
    const model = this.getModel();
    const result = await model.update({ status }, { where: { id, delete_version: 0 } });
    return result[0] > 0;
  }

  /**
   * 查询推荐作品
   */
  async findRecommended(limit = 20) {
    const model = this.getModel();
    return await model.findAll({
      where: { status: 1, delete_version: 0 },
      include: [{ model: sequelize.models.User, as: 'author', attributes: ['uid', 'username', 'avatar'] }],
      attributes: { exclude: ['analysis_data', 'delete_version'] },
      order: [
        [sequelize.literal('(likes_count * 10 + views_count * 1 + RAND() * 30)'), 'DESC']
      ],
      limit
    });
  }

  /**
   * 根据 ID 查询
   */
  async findById(id) {
    const model = this.getModel();
    const User = sequelize.models.User;

    return await model.findOne({
      where: { id, delete_version: 0 },
      include: [{ model: User, as: 'author', attributes: ['uid', 'username', 'avatar'] }],
      attributes: { exclude: ['analysis_data', 'delete_version', 'user_id', 'deleted_at'] }
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

  /**
   * 查询用户关注者的作品
   */
  async findFollowingWorks(userId, options = {}) {
    const model = this.getModel();
    const Follow = sequelize.models.Follow;

    // 查出当前用户关注的所有人
    const follows = await Follow.findAll({
      where: { follower_id: userId, delete_version: 0 },
      attributes: ['following_id']
    });

    const followingIds = follows.map(f => f.following_id);

    const page = options.page ? Number(options.page) : (options.limit ? Math.floor((options.offset || 0) / options.limit) + 1 : 1);
    const pageSize = options.pageSize ? Number(options.pageSize) : (options.limit ? Number(options.limit) : 20);
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    if (followingIds.length === 0) {
      return {
        list: [],
        total: 0,
        page,
        pageSize
      };
    }

    const { count, rows } = await model.findAndCountAll({
      where: {
        user_id: followingIds,
        status: 1,
        delete_version: 0
      },
      include: [{ model: sequelize.models.User, as: 'author', attributes: ['uid', 'username', 'avatar'] }],
      attributes: { exclude: ['analysis_data', 'delete_version'] },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return {
      list: rows,
      total: count,
      page,
      pageSize
    };
  }
}

export default new WorkDao();
