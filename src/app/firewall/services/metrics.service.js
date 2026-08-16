/**
 * 防火墙指标视图服务
 *
 * 从 api/firewall/v1/metrics.js 下沉：性能指标聚合 + blocks 分类统计 + 百分比计算。
 * 路由层只调本服务 + reply。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { getSummary } from '../data/store.js';
import { getActiveBlocks, getActiveWhitelist } from '../dao/block-manager.js';

/**
 * 聚合防火墙性能指标视图
 * @param {object} redis - Fastify redis 实例（查封禁/白名单）
 * @returns {Promise<object>} 指标视图（requests/blocks/whitelist/topRegions/topPaths）
 */
export async function getMetricsView(redis) {
  const summary = getSummary();
  const blocks = await getActiveBlocks(redis);
  const whitelist = await getActiveWhitelist(redis);

  return {
    requests: {
      total: summary.totalRequests || 0,
      blocked: summary.totalBlocked || 0,
      rate: summary.totalRequests > 0 ? ((summary.totalBlocked / summary.totalRequests) * 100).toFixed(2) + '%' : '0%'
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
  };
}
