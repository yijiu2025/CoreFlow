/**
 * User 管理接口（管理端）
 *
 * 落 /admin/user/v1/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['superadmin'/'admin_admin'/'admin_operator'(读接口另含 admin_viewer)]。
 *
 * GET /admin/user/v1/list — 用户列表（分页，admin only）
 *
 * TODO（桩，暂未实现）：ban/unban/setrole/getrole/setpermission/listbycondition
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import UserDao from '../../../../app/oauth21/dao/user.dao.js';

async function registerAdminRoutes(fastify) {
  registerGroupMetadata({
    name: 'userAdmin',
    alias: '用户管理',
    description: '用户列表与管理（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['superadmin', 'admin_admin', 'admin_operator', 'admin_viewer']
  });

  /**
   * GET /admin/user/v1/list — 用户列表（分页）
   *
   * 从 oauth21 域迁入：原 /oauth2.1/admin/users 与公开授权端点同前缀，安全边界混乱；
   * 用户管理本属 user 域，故迁此。返回数据排除内部 id 与 phone 密文。
   */
  registerSecureRoute(fastify, {
    name: 'listUsers',
    alias: '用户列表',
    method: 'GET',
    url: '/list',
    requireLogin: true,
    allowRoles: ['superadmin', 'admin_admin', 'admin_operator', 'admin_viewer'],
    // 分页必须走 schema：没有 schema 时 `limit=abc` → Number() → NaN → Sequelize 抛错变 500，
    // 且 offset 无上限。AJV 会做类型强制与范围校验，非法入参稳定得到 400。
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    },
    handler: async (request, reply) => {
      const { limit, offset } = request.query;
      const users = await UserDao.listUsers({ limit, offset });
      return reply.result.success('获取成功', users);
    }
  });
}

export default registerAdminRoutes;
