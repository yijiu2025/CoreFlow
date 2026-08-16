/**
 * 防火墙性能指标路由
 *
 * GET /api/firewall/v1/metrics — 获取性能指标
 *
 * 业务逻辑见 app/firewall/services/metrics.service.js（getMetricsView）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getMetricsView } from '../../../app/firewall/services/metrics.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'metrics',
    alias: '性能指标',
    description: '防火墙性能统计',
    prefix: '/v1/metrics',
    enabled: true,
    requireLogin: true
  });

  /**
   * GET /api/firewall/v1/metrics
   */
  registerSecureRoute(fastify, {
    name: 'getMetrics',
    alias: '获取性能指标',
    method: 'GET',
    url: '/',
    requireLogin: true,
    handler: async (req, reply) => {
      const view = await getMetricsView(req.server.redis);
      return reply.result.success('获取成功', view);
    }
  });
}
