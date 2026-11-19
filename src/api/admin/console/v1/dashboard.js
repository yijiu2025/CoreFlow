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
import { hasPermissionLike } from '../../../../app/console/utils/permissions.js';
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
      /*
       * 最近登录是**明细**（账号 + IP + UA + 时间），比"用户总数 3"敏感得多：
       * 计数是概览的本意，明细等于能看到"谁在什么时候从哪个 IP 登录"。
       * 所以只有日志读权限（或通配）才下发，否则返回空数组 + 一个标记 ——
       * 让前端能说"需要日志权限"，而不是假装"暂无记录"。
       */
      /*
       * 🔴 用 `hasPermissionLike`（具体码 + 通配覆盖），不能用 `hasAnyPermissionIn`：
       *    后者按**命名空间**判，`admin:*` 对 `admin:log:` 前缀不成立 ——
       *    实测超管会被判成"没有日志权限"，反而是持有 `admin:log:xxx` 的普通管理员能看。
       */
      const canSeeRecentLogins = hasPermissionLike(request.state.user?.permissions, ADMIN_PERMISSIONS.LOG.READ.code);
      const data = await dashboardService.summary({ includeRecentLogins: canSeeRecentLogins });
      return reply.result.success('获取成功', { ...data, recentLoginsLocked: !canSeeRecentLogins });
    })
  });
}

export default registerDashboardRoutes;
