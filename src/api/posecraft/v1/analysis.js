/**
 * PoseCraft AI 分析 API
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'analysis',
    description: 'AI 分析',
    prefix: '/v1'
  });

  // 保存分析结果（需要登录）
  registerSecureRoute(fastify, {
    name: 'saveAnalysis',
    alias: '保存分析结果',
    method: 'POST',
    url: '/analysis',
    requireLogin: true,
    permission: 'posecraft:analysis:use',
    handler: async (request, reply) => {
      const { image_url, analysis_type, result_data, processing_time } = request.body;
      const user = request.state.user;
      const { Analysis } = fastify.db.models;

      const analysis = await Analysis.create({
        user_id: user.userId,
        image_url,
        analysis_type,
        result_data,
        processing_time,
        status: 1
      });

      return reply.result.success('保存成功', analysis);
    }
  });

  // 获取分析记录（需要登录）
  registerSecureRoute(fastify, {
    name: 'getAnalyses',
    alias: '获取分析记录',
    method: 'GET',
    url: '/analysis',
    requireLogin: true,
    permission: 'posecraft:analysis:view',
    handler: async (request, reply) => {
      const { analysis_type, page = 1, pageSize = 20 } = request.query;
      const user = request.state.user;
      const { Analysis } = fastify.db.models;

      const where = { user_id: user.userId };
      if (analysis_type) where.analysis_type = analysis_type;

      const analyses = await Analysis.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize)
      });

      return reply.result.success('获取成功', analyses);
    }
  });

  // 获取分析统计（需要登录）
  registerSecureRoute(fastify, {
    name: 'getAnalysisStats',
    alias: '获取分析统计',
    method: 'GET',
    url: '/analysis/stats',
    requireLogin: true,
    permission: 'posecraft:analysis:view',
    handler: async (request, reply) => {
      const user = request.state.user;
      const { Analysis } = fastify.db.models;

      const total = await Analysis.count({
        where: { user_id: user.userId }
      });

      const byType = await Analysis.findAll({
        where: { user_id: user.userId },
        attributes: [
          'analysis_type',
          [fastify.db.sequelize.fn('COUNT', fastify.db.sequelize.col('id')), 'count']
        ],
        group: ['analysis_type']
      });

      return reply.result.success('获取成功', {
        total,
        byType: byType.map((item) => ({
          type: item.analysis_type,
          count: parseInt(item.getDataValue('count'))
        }))
      });
    }
  });
}
