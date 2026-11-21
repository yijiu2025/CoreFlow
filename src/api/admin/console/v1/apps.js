/**
 * 应用管理接口（只读）
 *
 * GET /admin/console/v1/apps —— 应用清单 + 授权数据规模
 *
 * === 为什么只有 GET ===
 * 应用是**代码声明**的：一个应用 = `src/app/<app>/config.js`（声明 app_id / 准入策略 /
 * 默认角色）+ `src/api/<system>/system.json`（声明路由前缀与所属应用）。增删改都意味着
 * 加目录、改代码、重启，不是表单能表达的操作；而 `default_role` / `access` 一旦被随手改，
 * 后果是"后台对所有人敞开"或"谁都进不来"——那必须走代码评审。
 *
 * 所以这一版只回答"系统里有哪些应用、各自配了多少东西"，写操作留给代码。
 * 以后要放开，先有 `data/*.json` 覆盖层与审计，再谈编辑。
 *
 * 🔴 按应用授权：页面入口是 `admin:app:read`，但**每个应用各自一个管理码**
 *    （`admin:app:<appId>:manage`）。没有该码的应用整行不返回 —— 后续要在这里加
 *    "接口开关 / 应用级配置"，权限粒度正好复用这一层，不用再发明新码。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import { listAppsOverview } from '../../../../app/admin/console/services/app-overview.service.js';
import { withFail } from '../../../../app/admin/console/utils/respond.js';

async function registerAppRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleApp',
    alias: '应用管理',
    description: '应用清单与授权数据规模（只读）',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleAppList',
    alias: '应用列表',
    method: 'GET',
    url: '/apps',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.APP.READ,
    handler: withFail(async (request, reply) => {
      /*
       * 把操作者传进服务层：只返回**他有管理码**的应用（`admin:app:<appId>:manage`）。
       * 过滤放在数据源这一侧，前端拿到的就是"你能管的那些"，不需要再判一次。
       */
      const apps = await listAppsOverview(request.state.user);
      return reply.result.success('获取成功', { apps, total: apps.length });
    })
  });
}

export default registerAppRoutes;
