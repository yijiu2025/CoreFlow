/**
 * PoseCraft 模板数据访问层
 */
import sequelize from '../../../db/index.js';

class TemplateDao {
  getModel() {
    return sequelize.models.Template;
  }

  /**
   * 查询模板列表 (带权限过滤)
   */
  async findAll(options = {}, user = null, isAdmin = false) {
    const model = this.getModel();
    const { Op } = await import('sequelize');

    const where = { delete_version: 0 };

    if (options.category) {
      where.category = options.category;
    }

    if (options.keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${options.keyword}%` } },
        { description: { [Op.like]: `%${options.keyword}%` } }
      ];
    }

    // 根据角色及登录态注入权限可见度控制
    if (isAdmin) {
      if (options.status !== undefined) {
        where.status = Number(options.status);
      }
    } else if (user?.userId) {
      if (options.status !== undefined) {
        const targetStatus = Number(options.status);
        where[Op.and] = [
          { status: targetStatus },
          {
            [Op.or]: [
              { status: 1 },
              { user_id: user.userId }
            ]
          }
        ];
      } else {
        where[Op.or] = [
          { status: 1 },
          { user_id: user.userId }
        ];
      }
    } else {
      where.status = 1; // 未登录只看公开
    }

    const page = options.page ? Number(options.page) : (options.limit ? Math.floor((options.offset || 0) / options.limit) + 1 : 1);
    const pageSize = options.pageSize ? Number(options.pageSize) : (options.limit ? Number(options.limit) : 20);
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const { count, rows } = await model.findAndCountAll({
      where,
      attributes: { exclude: ['pose_data'] },
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
   * 查询热门模板
   */
  async findPopular(limit = 10) {
    const model = this.getModel();
    return await model.findAll({
      where: { status: 1, delete_version: 0 },
      attributes: { exclude: ['pose_data'] },
      order: [
        [sequelize.literal('(uses_count * 10 + likes_count * 5 + RAND() * 30)'), 'DESC']
      ],
      limit
    });
  }

  /**
   * 按用户查询模板
   */
  async findByUser(userId, options = {}, isAdmin = false) {
    return await this.findAll({ ...options, userId }, { userId }, isAdmin);
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
      attributes: { exclude: ['pose_data'] },
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
