/**
 * PoseCraft 模板数据访问层
 */
import sequelize from '../../../db/index.js';
import { generateSkeletonPreview, generateImageThumbnail } from '../utils/preview.js';

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

  /**
   * 同步为模板创建作品记录（模板的底图作品）
   *
   * 1. 创建 Work 并以 template_id 指向本模板
   * 2. 回填 Template.work_id 实现双向绑定
   * 3. 为模板生成骨架预览图（thumbnail_url = 纯骨架 PNG，透明背景）
   * 4. 作品的 thumbnail_url = 底图原图压缩版（WebP 70%，尺寸不变）
   *
   * @param {Template} template - 已持久化的 Template 实例
   * @param {number} userId - 创建者 ID
   * @returns {Promise<Work|null>} 创建的 Work 实例，无 image_url 时返回 null
   */
  async syncCreateWork(template, userId) {
    const Work = sequelize.models.Work;
    if (!template.image_url) return null;

    // 生成作品缩略图：底图原图压缩（WebP 70%，尺寸不变）；失败则回退原图
    const thumbUrl = (await generateImageThumbnail(template.image_url)) || template.image_url;

    // 创建底图作品
    const work = await Work.create({
      user_id: userId,
      template_id: template.id,
      title: template.title || '模板底图作品',
      description: template.description || '',
      image_url: template.image_url,
      thumbnail_url: thumbUrl,
      edit_data: { is_template_work: true },
      is_template_work: true, // 独立字段，方便列表查询筛选
      status: 2, // 模板底图作品待审核，不可见
      delete_version: 0
    });

    // 回填 template.work_id，实现双向绑定
    await template.update({ work_id: work.id });

    // 生成骨架预览图给模板（透明背景 PNG）
    const skeletonUrl = await generateSkeletonPreview(template.pose_data);
    if (skeletonUrl) {
      await template.update({ thumbnail_url: skeletonUrl });
    }

    return work;
  }

  /**
   * 同步更新模板对应的作品记录
   *
   * - 作品的 thumbnail_url = 底图原图压缩版（WebP 70%，尺寸不变）
   * - 非管理员更新后重置为 status: 2（待审核），而非直接公开
   * - 若 Work 不存在则创建，并回填 template.work_id
   *
   * @param {number} templateId - 模板 ID
   * @param {object} data - 本次更新的字段
   * @param {Template} template - 当前 Template 实例
   */
  async syncUpdateWork(templateId, data, template) {
    const Work = sequelize.models.Work;
    let work = await Work.findOne({
      where: {
        template_id: templateId,
        delete_version: 0
      }
    });

    const newImageUrl = data.image_url || template.image_url;
    // 压缩底图为缩略图；失败则回退原图
    const thumbUrl = (await generateImageThumbnail(newImageUrl)) || newImageUrl;

    const workData = {
      title: data.title || template.title,
      description: data.description || template.description,
      image_url: newImageUrl,
      thumbnail_url: thumbUrl,
      is_template_work: true, // 始终是模板底图作品
      status: 2 // 更新后重新走审核流程，不可直接公开
    };

    if (work) {
      await work.update(workData);
    } else if (newImageUrl) {
      work = await Work.create({
        user_id: template.user_id,
        template_id: templateId,
        ...workData,
        edit_data: { is_template_work: true },
        is_template_work: true,
        delete_version: 0
      });
    }

    // 确保双向绑定（新创建或历史缺失都补上）
    if (work && !template.work_id) {
      await template.update({ work_id: work.id });
    }
  }

  /**
   * 审核模板时联动同步对应底图作品的状态
   *
   * @param {number} templateId - 模板 ID
   * @param {number} status - 审核后的状态（1-公开 / -2-拒绝）
   */
  async syncAuditWork(templateId, status) {
    const template = await this.findById(templateId);
    if (!template?.work_id) return;
    const Work = sequelize.models.Work;
    await Work.update({ status }, { where: { id: template.work_id, delete_version: 0 } });
  }

  /**
   * 同步删除模板对应的作品记录
   */
  async syncDeleteWork(templateId) {
    const Work = sequelize.models.Work;
    const templateWork = await Work.findOne({ where: { template_id: templateId, delete_version: 0 } });
    if (templateWork) {
      // 级联软删除对应的模板底图作品
      await templateWork.update({ delete_version: templateWork.id });
    }
  }
}

export default new TemplateDao();
