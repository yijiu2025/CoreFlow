/**
 * 防火墙性能指标 API
 *
 * GET /api/firewall/v1/metrics — 获取性能指标
 *
 * 返回：请求数、拦截数、延迟、检测器状态等
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getSummary } from '../../../app/firewall/data/store.js';
import { getActiveBlocks, getActiveWhitelist } from '../../../app/firewall/dao/block-manager.js';

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
      const summary = getSummary();
      const blocks = await getActiveBlocks(req.server.redis);
      const whitelist = await getActiveWhitelist(req.server.redis);

      return reply.result.success('获取成功', {
        requests: {
          total: summary.totalRequests || 0,
          blocked: summary.totalBlocked || 0,
          rate: summary.totalRequests > 0
            ? ((summary.totalBlocked / summary.totalRequests) * 100).toFixed(2) + '%'
            : '0%'
        },
        blocks: {
          total: blocks.length,
          byType: {
            ip: blocks.filter(b => b.type !== 'fingerprint').length,
            fingerprint: blocks.filter(b => b.type === 'fingerprint').length
          }
        },
        whitelist: {
          total: whitelist.length
        },
        topRegions: (summary.topRegions || []).slice(0, 5),
        topPaths: (summary.topPaths || []).slice(0, 5)
      });
    }
  });
}
