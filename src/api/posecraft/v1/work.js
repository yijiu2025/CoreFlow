/**
 * PoseCraft 作品 API
 * 负责作品的查询、创建、删除及互动。
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import workDao from '../../../app/posecraft/dao/work.dao.js';
import templateDao from '../../../app/posecraft/dao/template.dao.js';
import { composeWorkPreview, generateImageThumbnail } from '../../../app/posecraft/utils/preview.js';
import { checkDataPermission } from '../../../app/posecraft/services/permission.service.js';
import { formatWorkDetail, formatWorkList } from '../../../app/posecraft/services/work-view.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'work',
    description: '作品管理',
    prefix: '/v1'
  });

  // 获取作品列表（公开）
  registerSecureRoute(fastify, {
    name: 'getWorks',
    alias: '获取作品列表',
    method: 'GET',
    url: '/works',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          keyword: { type: 'string', maxLength: 100 },
          category: { type: 'string', maxLength: 50 },
          sort: { type: 'string', maxLength: 50 }
        }
      }
    },
    handler: async (request, reply) => {
      const { keyword, page, pageSize, category, sort } = request.query;
      // 从 session 获取权威用户 ID（数字），无需前端传递
      const currentUserId = request.state?.user?.userId;

      const result = await workDao.findAll({
        keyword,
        page,
        pageSize,
        currentUserId,
        category,
        sort
      });

      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取推荐作品（公开）
  registerSecureRoute(fastify, {
    name: 'getRecommendedWorks',
    alias: '获取推荐作品',
    method: 'GET',
    url: '/works/recommended',
    handler: async (request, reply) => {
      const { limit = 20 } = request.query;

      const works = await workDao.findRecommended(parseInt(limit));

      return reply.result.success('获取成功', formatWorkList(works));
    }
  });

  // 获取用户作品（公开）
  registerSecureRoute(fastify, {
    name: 'getUserWorks',
    alias: '获取用户作品',
    method: 'GET',
    url: '/works/user/:userId',
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'integer' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { userId } = request.params;
      const { page, pageSize } = request.query;
      const currentUserId = request.state?.user?.userId;

      const result = await workDao.findByUser(userId, {
        page,
        pageSize,
        currentUserId
      });

      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取当前登录用户自己的作品（从 session 识别用户，无需传 id）
  registerSecureRoute(fastify, {
    name: 'getMyWorks',
    alias: '获取我的作品',
    method: 'GET',
    url: '/works/mine',
    requireLogin: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'integer' }
        }
      }
    },
    handler: async (request, reply) => {
      const user = request.state?.user;
      if (!user?.userId) {
        return reply.result.fail('未登录', null, 401);
      }
      const { page, pageSize, status } = request.query;
      const opts = { page, pageSize, currentUserId: user.userId };
      if (status !== undefined) opts.status = status;
      const result = await workDao.findByUser(user.userId, opts);
      return reply.result.paginated(formatWorkList(result.list), result.total, result.page, result.pageSize);
    }
  });

  // 获取作品详情（公开）
  registerSecureRoute(fastify, {
    name: 'getWork',
    alias: '获取作品详情',
    method: 'GET',
    url: '/works/:id',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state?.user;

      const work = await workDao.findById(id);

      if (!work) {
        return reply.result.fail('作品不存在');
      }

      // 增加浏览量
      await workDao.incrementViews(id);

      // 判断是否为作者本人
      const isOwner = !!(user?.userId && work.user_id === user.userId);

      return reply.result.success('获取成功', formatWorkDetail(work, isOwner));
    }
  });

  registerSecureRoute(fastify, {
    name: 'getWorkPreview',
    alias: '获取作品实时预览图',
    method: 'GET',
    url: '/works/:id/preview',
    handler: async (request, reply) => {
      const { id } = request.params;
      const work = await workDao.findById(id);
      if (!work) {
        return reply.code(404).send('Work not found');
      }

      // 委托 preview.js 合成（查关联模板 → 复用 composeTemplatePreview → 兜底占位图）
      const buffer = await composeWorkPreview(work);
      reply.type('image/png');
      return reply.send(buffer);
    }
  });

  // 创建作品（需要登录）
  registerSecureRoute(fastify, {
    name: 'createWork',
    alias: '创建作品',
    method: 'POST',
    url: '/works',
    requireLogin: true,
    permission: 'posecraft:work:create',
    handler: async (request, reply) => {
      const {
        title,
        description,
        template_id,
        image_url,
        analysis_data,
        edit_data,
        category,
        publication_address,
        publication_lat,
        publication_lng,
        publication_source,
        work_address,
        work_lat,
        work_lng,
        work_address_source
      } = request.body;
      const user = request.state.user;

      // 作品的 thumbnail_url = 底图原图压缩版（WebP 70%，尺寸不变，省带宽）
      const thumbUrl = (image_url && (await generateImageThumbnail(image_url))) || image_url || '';

      const work = await workDao.create({
        title,
        description,
        template_id,
        image_url,
        thumbnail_url: thumbUrl,
        analysis_data,
        edit_data,
        category: category || 'pose',
        is_template_work: false,
        user_id: user.userId,
        status: 1,
        delete_version: 0,
        // 地址字段
        publication_address: publication_address || null,
        publication_lat: publication_lat || null,
        publication_lng: publication_lng || null,
        publication_source: publication_source || null,
        work_address: work_address || null,
        work_lat: work_lat || null,
        work_lng: work_lng || null,
        work_address_source: work_address_source || null
      });

      // 若基于模板创建，异步递增模板使用次数（不阻塞响应）
      if (template_id) {
        templateDao.incrementUses(template_id).catch(err => {
          fastify.log.warn({ err, template_id }, '[Work] 递增模板使用次数失败');
        });
      }

      return reply.result.success('创建成功', work);
    }
  });

  // 删除作品（需要登录）
  // 数据级权限校验：只允许作品创建者本人，或管理员删除任何人的作品。
  registerSecureRoute(fastify, {
    name: 'deleteWork',
    alias: '删除作品',
    method: 'DELETE',
    url: '/works/:id',
    requireLogin: true,
    permission: 'posecraft:work:delete',
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const work = await workDao.findById(id);

      // 数据级权限校验：创建者本人或管理员放行
      if (!work || !checkDataPermission(work, user)) {
        return reply.result.forbidden('删除失败，作品不存在或无权限');
      }

      await workDao.delete(id, work.user_id);
      return reply.result.success('删除成功');
    }
  });

  // 点赞作品（需要登录）
  registerSecureRoute(fastify, {
    name: 'likeWork',
    alias: '点赞作品',
    method: 'POST',
    url: '/works/:id/like',
    requireLogin: true,
    handler: async (request, reply) => {
      const { id } = request.params;

      const work = await workDao.findById(id);

      if (!work) {
        return reply.result.fail('点赞失败，作品不存在');
      }

      await workDao.incrementLikes(id);

      return reply.result.success('点赞成功');
    }
  });
  // 获取关注者的作品
  registerSecureRoute(fastify, {
    name: 'getFollowingWorks',
    alias: '获取关注者的作品',
    method: 'GET',
    url: '/works/following',
    requireLogin: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { page, pageSize } = request.query;
      const user = request.state.user;

      const result = await workDao.findFollowingWorks(user.userId, {
        page,
        pageSize
      });

      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  // 获取互关朋友的作品
  registerSecureRoute(fastify, {
    name: 'getFriendsWorks',
    alias: '获取互关朋友的作品',
    method: 'GET',
    url: '/works/friends',
    requireLogin: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { page, pageSize } = request.query;
      const user = request.state.user;

      const result = await workDao.findFriendsWorks(user.userId, { page, pageSize });

      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  // 获取附近的公开作品
  registerSecureRoute(fastify, {
    name: 'getNearbyWorks',
    alias: '获取附近的公开作品',
    method: 'GET',
    url: '/works/nearby',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radius: { type: 'number', default: 50 },
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { lat, lng, radius, page, pageSize } = request.query;
      const currentUserId = request.state?.user?.userId;

      const result = await workDao.findNearbyWorks({ lat, lng, radius, page, pageSize, currentUserId });

      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });
}
