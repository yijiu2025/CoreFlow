/**
 * PoseCraft 用户互动 API
 * 负责浏览历史记录、点赞/收藏切换与状态查询、以及历史/点赞/收藏列表获取。
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import interactionDao from '../../../app/posecraft/dao/interaction.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'interaction',
    description: '用户互动管理 (点赞、收藏、足迹记录)',
    prefix: '/v1'
  });

  // 1. 记录浏览历史 (支持作品和模板)
  registerSecureRoute(fastify, {
    name: 'recordHistory',
    alias: '记录浏览历史',
    method: 'POST',
    url: '/interaction/history',
    requireLogin: true,
    handler: async (request, reply) => {
      const { workId, templateId } = request.body || {};
      const userId = request.state.user.userId;

      await interactionDao.recordHistory(userId, { workId, templateId });
      return reply.result.success('历史记录成功');
    }
  });

  // 2. 切换点赞状态
  registerSecureRoute(fastify, {
    name: 'toggleLike',
    alias: '点赞/取消点赞',
    method: 'POST',
    url: '/interaction/like',
    requireLogin: true,
    handler: async (request, reply) => {
      const { workId, templateId, like } = request.body || {};
      const userId = request.state.user.userId;

      const result = await interactionDao.toggleLike(userId, { workId, templateId, like });
      if (!result.success) {
        return reply.result.fail(result.message);
      }
      return reply.result.success(result.message, { liked: result.liked });
    }
  });

  // 3. 切换收藏状态
  registerSecureRoute(fastify, {
    name: 'toggleCollect',
    alias: '收藏/取消收藏',
    method: 'POST',
    url: '/interaction/collect',
    requireLogin: true,
    handler: async (request, reply) => {
      const { workId, templateId, collect } = request.body || {};
      const userId = request.state.user.userId;

      const result = await interactionDao.toggleCollect(userId, { workId, templateId, collect });
      if (!result.success) {
        return reply.result.fail(result.message);
      }
      return reply.result.success(result.message, { collected: result.collected });
    }
  });

  // 4. 查询当前用户对特定作品/模板的互动状态 (是否点赞，是否收藏)
  registerSecureRoute(fastify, {
    name: 'checkInteractionStatus',
    alias: '检查互动状态',
    method: 'GET',
    url: '/interaction/status',
    requireLogin: true,
    handler: async (request, reply) => {
      const { workId, templateId } = request.query;
      const userId = request.state.user.userId;

      const status = await interactionDao.checkStatus(userId, {
        workId: workId ? Number(workId) : null,
        templateId: templateId ? Number(templateId) : null
      });

      return reply.result.success('查询成功', status);
    }
  });

  // 5. 获取用户的浏览历史列表
  registerSecureRoute(fastify, {
    name: 'getHistoryList',
    alias: '获取历史记录列表',
    method: 'GET',
    url: '/interaction/history/list',
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
      const userId = request.state.user.userId;

      const result = await interactionDao.getHistoryList(userId, { page, pageSize });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  // 6. 获取用户的点赞列表
  registerSecureRoute(fastify, {
    name: 'getLikesList',
    alias: '获取点赞列表',
    method: 'GET',
    url: '/interaction/like/list',
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
      const userId = request.state.user.userId;

      const result = await interactionDao.getLikesList(userId, { page, pageSize });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  // 7. 获取用户的收藏列表
  registerSecureRoute(fastify, {
    name: 'getCollectsList',
    alias: '获取收藏列表',
    method: 'GET',
    url: '/interaction/collect/list',
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
      const userId = request.state.user.userId;

      const result = await interactionDao.getCollectsList(userId, { page, pageSize });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });
}
