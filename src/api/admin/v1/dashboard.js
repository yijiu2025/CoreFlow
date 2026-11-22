/**
 * 工作台接口
 *
 * GET /admin/v1/dashboard/summary —— 系统读数、7 日趋势、最近登录
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../app/admin/permission/index.js';
import dashboardService from '../../../app/admin/console/services/dashboard.service.js';
import { hasPermissionLike } from '../../../app/admin/console/utils/permissions.js';
import { withFail } from '../../../app/admin/console/utils/respond.js';

async function registerDashboardRoutes(fastify) {
  registerGroupMetadata({
    name: 'adminDashboard',
    alias: '管理后台工作台',
    description: '系统读数与趋势聚合',
    prefix: '/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'adminDashboardSummary',
    alias: '工作台概览',
    method: 'GET',
    url: '/dashboard/summary',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.DASHBOARD.READ,
    handler: withFail(async (request, reply) => {
      /*
       * 工作台上所有**日志派生**的数据（今日登录/失败、今日操作、成功率、活跃账号、
       * 7 日趋势、最近登录明细）都跟这条权限走。
       *
       * 为什么不只收"最近登录明细"：工作台里 `LoginPulseCard` 调用的
       * `/login-logs/stats` 本来就要求 `admin:log:read` —— 只有 dashboard 权限的账号
       * 打开工作台时它已经是 403 了。摘要继续给"今日操作 12 次"、趋势图却说"没权限"，
       * 比两者都不给更让人困惑。
       */
      /*
       * 🔴 用 `hasPermissionLike`（具体码 + 通配覆盖），不能用 `hasAnyPermissionIn`：
       *    后者按**命名空间**判，`admin:*` 对 `admin:log:` 前缀不成立 ——
       *    实测超管会被判成"没有日志权限"，反而是持有 `admin:log:xxx` 的普通管理员能看。
       *
       * 🔴 这里传 `ADMIN_PERMISSIONS.LOG.READ`，**不能再点 `.code`**。
       *    `createPermissionRegistry` 产出的注册表已经把 `{ code, label, type }` 拍平成
       *    权限码字符串（运行时 `ADMIN_PERMISSIONS.LOG.READ === 'admin:log:read'`），
       *    多写一层 `.code` 拿到的是 `undefined`。而只有**持有通配码**（`admin:*` / `*`）
       *    的账号才会走进 `pattern.endsWith('*')` 分支去执行 `code.startsWith(...)`，
       *    于是恰好是管理员一打开工作台就 500：
       *    `Cannot read properties of undefined (reading 'startsWith')`（2026-11-22 事故）。
       */
      const canSeeLogData = hasPermissionLike(request.state.user?.permissions, ADMIN_PERMISSIONS.LOG.READ);
      const data = await dashboardService.summary({ includeLogData: canSeeLogData });
      return reply.result.success('获取成功', data);
    })
  });
}

export default registerDashboardRoutes;
