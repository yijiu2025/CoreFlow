/**
 * 防火墙只读监控接口
 *
 * GET /admin/console/v1/firewall/summary    —— 流量与拦截汇总
 * GET /admin/console/v1/firewall/blocks     —— 生效中的封禁名单（分页）
 * GET /admin/console/v1/firewall/whitelist  —— 生效中的白名单
 *
 * 只读：写操作（加黑 / 解封 / 改策略）仍由防火墙自己的控制台承担，
 * 这里不复制一套写入口，避免两处策略状态不一致。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import { getSummaryAggregated } from '../../../../app/firewall/data/store.js';
import { getActiveBlocks, getActiveWhitelist } from '../../../../framework/ingress/firewall/block-manager.js';
import { withFail } from '../../../../app/console/utils/respond.js';

async function registerConsoleFirewallRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleFirewall',
    alias: '管理后台防火墙监控',
    description: '防火墙汇总、封禁名单、白名单（只读）',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleFirewallSummary',
    alias: '防火墙汇总',
    method: 'GET',
    url: '/firewall/summary',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.FIREWALL.READ,
    handler: withFail(async (request, reply) => {
      const data = await getSummaryAggregated();
      return reply.result.success('获取成功', data);
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleFirewallBlocks',
    alias: '封禁名单',
    method: 'GET',
    url: '/firewall/blocks',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.FIREWALL.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20 } = request.query;
      const all = await getActiveBlocks();
      const start = (Number(pageNum) - 1) * Number(pageSize);
      return reply.result.success('获取成功', {
        rows: all.slice(start, start + Number(pageSize)),
        total: all.length,
        pageNum: Number(pageNum),
        pageSize: Number(pageSize)
      });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleFirewallWhitelist',
    alias: '白名单',
    method: 'GET',
    url: '/firewall/whitelist',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.FIREWALL.READ,
    handler: withFail(async (request, reply) => {
      return reply.result.success('获取成功', await getActiveWhitelist());
    })
  });
}

export default registerConsoleFirewallRoutes;
