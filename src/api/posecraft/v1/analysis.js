/**
 * PoseCraft AI 分析 API
 * 负责分析结果保存、分析记录查询以及分析统计数据获取。
 *
 * @author Claude
 * @since 2026-07-13
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import AnalysisDao from '../../../app/posecraft/dao/analysis.dao.js';

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

      const analysis = await AnalysisDao.create({
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

      const analyses = await AnalysisDao.findByUser(user.userId, {
        analysis_type,
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

      const total = await AnalysisDao.countByUser(user.userId);
      const byType = await AnalysisDao.getStatsByType(user.userId);

      return reply.result.success('获取成功', {
        total,
        byType
      });
    }
  });
}
