/**
 * User 管理接口（管理端）
 *
 * 落 /admin/user/v1/*，继承 admin 域 system 级 requireLogin:true + allowRoles:['admin']。
 *
 * GET /admin/user/v1/list — 用户列表（分页，admin only）
 *
 * TODO（桩，暂未实现）：ban/unban/setrole/getrole/setpermission/listbycondition
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import UserDao from '../../../../app/oauth21/dao/user.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'userAdmin',
    alias: '用户管理',
    description: '用户列表与管理（admin）',
    prefix: '/user/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
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
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { limit = 50, offset = 0 } = request.query;
      const users = await UserDao.listUsers({ limit: Number(limit), offset: Number(offset) });
      return reply.result.success('获取成功', users);
    }
  });
}
