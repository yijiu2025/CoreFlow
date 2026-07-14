/**
 * PoseCraft 推荐 API
 * 推荐/取消推荐/我的推荐列表/推荐状态检查
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import RecommendationDao from '../../../app/posecraft/dao/recommendation.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'recommendation',
    description: '推荐管理',
    prefix: '/v1'
  });

  /**
   * POST /works/:id/recommend - 推荐作品
   */
  registerSecureRoute(fastify, {
    name: 'recommendWork',
    alias: '推荐作品',
    method: 'POST',
    url: '/works/:id/recommend',
    requireLogin: true,
    handler: async (request, reply) => {
      const workId = Number(request.params.id);
      const userId = request.state.user.userId;

      const result = await RecommendationDao.create(userId, { workId });
      return reply.result.success('推荐成功', { id: result.id });
    }
  });

  /**
   * DELETE /works/:id/recommend - 取消推荐作品
   */
  registerSecureRoute(fastify, {
    name: 'cancelRecommendWork',
    alias: '取消推荐作品',
    method: 'DELETE',
    url: '/works/:id/recommend',
    requireLogin: true,
    handler: async (request, reply) => {
      const workId = Number(request.params.id);
      const userId = request.state.user.userId;

      const success = await RecommendationDao.cancel(userId, { workId });
      return success
        ? reply.result.success('已取消推荐')
        : reply.result.fail('未推荐过该作品', null, 404);
    }
  });

  /**
   * POST /templates/:id/recommend - 推荐模板
   */
  registerSecureRoute(fastify, {
    name: 'recommendTemplate',
    alias: '推荐模板',
    method: 'POST',
    url: '/templates/:id/recommend',
    requireLogin: true,
    handler: async (request, reply) => {
      const templateId = Number(request.params.id);
      const userId = request.state.user.userId;

      const result = await RecommendationDao.create(userId, { templateId });
      return reply.result.success('推荐成功', { id: result.id });
    }
  });

  /**
   * DELETE /templates/:id/recommend - 取消推荐模板
   */
  registerSecureRoute(fastify, {
    name: 'cancelRecommendTemplate',
    alias: '取消推荐模板',
    method: 'DELETE',
    url: '/templates/:id/recommend',
    requireLogin: true,
    handler: async (request, reply) => {
      const templateId = Number(request.params.id);
      const userId = request.state.user.userId;

      const success = await RecommendationDao.cancel(userId, { templateId });
      return success
        ? reply.result.success('已取消推荐')
        : reply.result.fail('未推荐过该模板', null, 404);
    }
  });

  /**
   * GET /recommendations/mine - 我的推荐列表（"我的→推荐"Tab）
   */
  registerSecureRoute(fastify, {
    name: 'getMyRecommendations',
    alias: '获取我的推荐',
    method: 'GET',
    url: '/recommendations/mine',
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
      const userId = request.state.user.userId;
      const { page, pageSize } = request.query;
      const result = await RecommendationDao.findMyRecommendations(userId, { page, pageSize });
      return reply.result.paginated(result.list, result.total, result.page, result.pageSize);
    }
  });

  /**
   * GET /recommendations/mine/count - 我的推荐数量
   */
  registerSecureRoute(fastify, {
    name: 'getMyRecommendationCount',
    alias: '获取我的推荐数量',
    method: 'GET',
    url: '/recommendations/mine/count',
    requireLogin: true,
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const count = await RecommendationDao.getCount(userId);
      return reply.result.success('获取成功', { count });
    }
  });

  /**
   * GET /recommendations/status - 检查是否已推荐（作品或模板）
   */
  registerSecureRoute(fastify, {
    name: 'checkRecommendationStatus',
    alias: '检查推荐状态',
    method: 'GET',
    url: '/recommendations/status',
    requireLogin: true,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          work_id: { type: 'integer' },
          template_id: { type: 'integer' }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const workId = request.query.work_id ? Number(request.query.work_id) : undefined;
      const templateId = request.query.template_id ? Number(request.query.template_id) : undefined;
      const recommended = await RecommendationDao.checkStatus(userId, { workId, templateId });
      return reply.result.success('查询成功', { recommended });
    }
  });
}
