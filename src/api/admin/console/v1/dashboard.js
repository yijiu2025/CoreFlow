/**
 * 工作台接口
 *
 * GET /admin/console/v1/dashboard/summary —— 系统读数、7 日趋势、最近登录
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import dashboardService from '../../../../app/console/services/dashboard.service.js';
import { withFail } from '../../../../app/console/utils/respond.js';

async function registerDashboardRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleDashboard',
    alias: '管理后台工作台',
    description: '系统读数与趋势聚合',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleDashboardSummary',
    alias: '工作台概览',
    method: 'GET',
    url: '/dashboard/summary',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DASHBOARD.READ,
    handler: withFail(async (request, reply) => {
      const data = await dashboardService.summary();
      return reply.result.success('获取成功', data);
    })
  });
}

export default registerDashboardRoutes;
