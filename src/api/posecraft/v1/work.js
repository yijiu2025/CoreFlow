/**
 * PoseCraft 作品 API
 * 负责作品的查询、创建、删除及互动。
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { createLogger } from '../../../framework/support/log/index.js';
import workDao from '../../../app/posecraft/dao/work.dao.js';
import templateDao from '../../../app/posecraft/dao/template.dao.js';
import interactionDao from '../../../app/posecraft/dao/interaction.dao.js';
import { composeWorkPreview, generateImageThumbnail } from '../../../app/posecraft/utils/preview.js';
import { checkDataPermission } from '../../../app/posecraft/services/permission.service.js';
import { formatWorkDetail, formatWorkList } from '../../../app/posecraft/services/work-view.service.js';

const log = createLogger('api.posecraft.work');

/**
 * 作品底图的合法形态：本站上传接口产出的路径（`/posecraft/<uuid>.<ext>`）
 *
 * 服务端文件名一律由 `upload.service` 用 `crypto.randomUUID()` 生成，
 * 因此这个正则既排除外部 URL，也排除 `..` / 绝对路径 / 任意 public 路径。
 */
const UPLOADED_IMAGE_RE =
  /^\/posecraft\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i;

async function registerWorkRoutes(fastify) {
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
    // limit 必须约束：此前 parseInt(limit) 无上限，`limit=1e9` 会把整表拉出来
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    },
    handler: async (request, reply) => {
      const { limit } = request.query;

      const works = await workDao.findRecommended(limit);

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

      // 判断是否为作者本人
      const isOwner = !!(user?.userId && work.user_id === user.userId);

      // 🔴 可见性校验（2026-11-07 修复）：列表接口与 /works/:id/preview 都只看 status=1 的
      // 公开作品，唯独详情接口漏了 —— 草稿(0)/待审核(2) 作品连同拍摄 GPS（formatWorkDetail
      // 会输出 publication_lat/lng、work_lat/lng）可被任何人按 id 枚举读取。
      // 与 preview 保持同一判据：公开 / 作者本人 / 管理员。
      if (work.status !== 1 && !isOwner && !checkDataPermission({ user_id: -1 }, user)) {
        return reply.result.forbidden('作品不存在或未公开');
      }

      // 增加浏览量（仅公开作品计入热度）
      if (work.status === 1) {
        await workDao.incrementViews(id);
      }

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

      // 🔴 越权修复：非公开作品，预览图只允许作者或管理员访问
      const user = request.state?.user;
      const isAdmin = checkDataPermission({ user_id: -1 }, user);
      if (work.status !== 1 && work.user_id !== user?.userId && !isAdmin) {
        return reply.code(403).send('Forbidden');
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

      // 🔴 底图必须来自本站上传接口（2026-11-07 修复）：image_url 此前完全由客户端给，
      // 随后被 generateImageThumbnail → publicUrlToPath 拿去读盘 —— 传 `//…`、`..`、
      // 或别人的文件路径都能走进文件系统；也等于给了一个"站内文件存在性探针"。
      if (image_url && !UPLOADED_IMAGE_RE.test(String(image_url))) {
        return reply.result.fail('image_url 必须是本站上传接口返回的路径', null, 400);
      }

      // 作品的 thumbnail_url = 底图原图压缩版（WebP 70%，尺寸不变，省带宽）
      // 缩略图只是优化，失败不能让建作品整体 500（原实现一抛错就没有回退）
      let thumbUrl = image_url || '';
      if (image_url) {
        try {
          thumbUrl = (await generateImageThumbnail(image_url)) || image_url;
        } catch (err) {
          log.warn('[Work] 生成缩略图失败，回退原图', err, { image_url });
        }
      }

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
          log.warn('[Work] 递增模板使用次数失败', err, { template_id });
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
  //
  // 🔴 幂等（2026-11-07 修复）：此前直接 `incrementLikes(id)`，不写 user_likes、不去重、
  // 不限频 —— 一个 for 循环就能把任意作品顶成热门（`sort=recommended` 的公式是
  // 点赞×15 + 收藏×12 + 分享×8 + 浏览×1）。同一功能在 /interaction/like
  // （interaction.dao.toggleLike）里本来就有唯一索引 + 原子增减的正确实现，此处复用它。
  registerSecureRoute(fastify, {
    name: 'likeWork',
    alias: '点赞作品',
    method: 'POST',
    url: '/works/:id/like',
    requireLogin: true,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer', minimum: 1 } }
      }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const user = request.state.user;

      const work = await workDao.findById(id);
      if (!work) {
        return reply.result.fail('点赞失败，作品不存在');
      }

      const result = await interactionDao.toggleLike(user.userId, { workId: id, like: true });
      if (!result.success) {
        return reply.result.fail(result.message);
      }
      // 计数用 DAO 回读的真实值；拿不到时退回请求前的快照（不要自己 +1/-1 猜）
      return reply.result.success(result.message, { liked: result.liked, likes: result.likes ?? work.likes_count });
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

export default registerWorkRoutes;
