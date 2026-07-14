/**
 * PoseCraft 作品数据访问层
 * 负责作品的 CRUD、推荐查询、关注用户作品查询及 liked/collected 状态标记
 *
 * @author Claude
 * @since 2026-07-13
 */
import sequelize from '../../../db/index.js';

class WorkDao {
  /**
   * 获取 Work 模型
   * @returns {Model} Work 模型
   */
  getModel() {
    return sequelize.models.Work;
  }

  /**
   * 查询作品列表（自动携带当前用户 liked/collected 状态）
   * @param {object} options - 查询参数（userId/templateId/keyword/page/pageSize/currentUserId）
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
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

    // 当前用户已点赞/已收藏的作品 ID 集合（用于前端标记状态）
    if (options.currentUserId && rows.length > 0) {
      const workIds = rows.map((w) => w.id);
      const [likedIds, collectedIds] = await Promise.all([
        this._getLikedTargetIds(options.currentUserId, workIds),
        this._getCollectedTargetIds(options.currentUserId, workIds)
      ]);
      for (const work of rows) {
        work.setDataValue('liked', likedIds.has(Number(work.id)));
        work.setDataValue('collected', collectedIds.has(Number(work.id)));
      }
    } else {
      for (const work of rows) {
        work.setDataValue('liked', false);
        work.setDataValue('collected', false);
      }
    }

    return {
      list: rows,
      total: count,
      page,
      pageSize
    };
  }

  /**
   * 获取当前用户已点赞的作品 ID 集合（内部辅助）
   * @param {number} userId - 用户 ID
   * @param {number[]} workIds - 作品 ID 数组
   * @returns {Promise<Set<number>>}
   */
  async _getLikedTargetIds(userId, workIds) {
    if (!workIds.length) return new Set();
    const { Op } = await import('sequelize');
    const UserLike = sequelize.models.UserLike;
    const records = await UserLike.findAll({
      where: { user_id: userId, work_id: { [Op.in]: workIds }, delete_version: 0 },
      attributes: ['work_id']
    });
    return new Set(records.map((r) => Number(r.work_id)));
  }

  /**
   * 获取当前用户已收藏的作品 ID 集合（内部辅助）
   * @param {number} userId - 用户 ID
   * @param {number[]} workIds - 作品 ID 数组
   * @returns {Promise<Set<number>>}
   */
  async _getCollectedTargetIds(userId, workIds) {
    if (!workIds.length) return new Set();
    const { Op } = await import('sequelize');
    const UserCollect = sequelize.models.UserCollect;
    const records = await UserCollect.findAll({
      where: { user_id: userId, work_id: { [Op.in]: workIds }, delete_version: 0 },
      attributes: ['work_id']
    });
    return new Set(records.map((r) => Number(r.work_id)));
  }

  /**
   * 查询用户作品
   * @param {number} userId - 用户 ID
   * @param {object} [options] - 额外查询参数
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
   */
  async findByUser(userId, options = {}) {
    return await this.findAll({ ...options, userId });
  }

  /**
   * 后台：查询审核列表
   * @param {object} [options] - 查询参数（status/keyword/limit/offset/page）
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
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
   * @param {number} id - 作品 ID
   * @param {number} status - 目标状态
   * @returns {Promise<boolean>}
   */
  async updateStatus(id, status) {
    const model = this.getModel();
    const result = await model.update({ status }, { where: { id, delete_version: 0 } });
    return result[0] > 0;
  }

  /**
   * 查询推荐作品（按点赞数+浏览数加权随机排序）
   * @param {number} [limit=20] - 返回条数
   * @returns {Promise<Array<Work>>}
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
   * 根据 ID 查询（携带 author 信息，排除敏感字段）
   * @param {number} id - 作品 ID
   * @returns {Promise<Work|null>}
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
   * @param {object} data - 作品数据
   * @returns {Promise<Work>}
   */
  async create(data) {
    const model = this.getModel();
    return await model.create(data);
  }

  /**
   * 更新作品
   * @param {number} id - 作品 ID
   * @param {object} data - 更新字段
   * @returns {Promise<Work|null>}
   */
  async update(id, data) {
    const model = this.getModel();
    const work = await this.findById(id);
    if (!work) return null;
    return await work.update(data);
  }

  /**
   * 删除作品（软删除），只有作者可删除
   * @param {number} id - 作品 ID
   * @param {number} userId - 当前用户 ID
   * @returns {Promise<boolean>}
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
   * @param {number} id - 作品 ID
   * @returns {Promise<void>}
   */
  async incrementViews(id) {
    const model = this.getModel();
    await model.increment('views_count', { where: { id } });
  }

  /**
   * 增加点赞数
   * @param {number} id - 作品 ID
   * @returns {Promise<void>}
   */
  async incrementLikes(id) {
    const model = this.getModel();
    await model.increment('likes_count', { where: { id } });
  }

  /**
   * 统计用户作品数（未软删）
   * @param {number} userId - 用户 ID
   * @returns {Promise<number>}
   */
  async countByUser(userId) {
    const model = this.getModel();
    return await model.count({
      where: { user_id: userId, delete_version: 0 }
    });
  }

  /**
   * 查询用户关注者的作品（"关注" Tab）
   * @param {number} userId - 当前用户 ID
   * @param {object} [options] - 分页参数
   * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
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
