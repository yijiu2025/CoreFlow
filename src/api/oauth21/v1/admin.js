import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import ClientDao from '../../../app/oauth21/dao/client.dao.js';
import UserDao from '../../../app/oauth21/dao/user.dao.js';
import PermissionDao from '../../../app/oauth21/dao/permission.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'admin',
    description: 'OAuth 客户端与用户管理',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * POST /admin/permissions/sync — 权限同步接口
   * 供子应用启动时自动上报权限点
   */
  registerSecureRoute(fastify, {
    name: 'syncPermissions',
    alias: '权限同步',
    method: 'POST',
    url: '/admin/permissions/sync',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { appId, permissions } = request.body;

      if (!appId || !Array.isArray(permissions)) {
        return reply.code(400).send({ error: '无效的同步数据' });
      }

      const result = await PermissionDao.syncAppPermissions(appId, permissions);
      return reply.send(result);
    }
  });

  /**
   * POST /admin/client — 创建 OAuth 客户端
   */
  registerSecureRoute(fastify, {
    name: 'createClient',
    alias: '创建客户端',
    method: 'POST',
    url: '/admin/client',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      // 只允许指定字段，防止注入
      const { client_name, redirect_uris, grant_types, scope, token_endpoint_auth_method, application_type } = request.body;
      const client = await ClientDao.create({
        client_name, redirect_uris, grant_types, scope, token_endpoint_auth_method, application_type
      });
      return reply.code(201).send(client);
    }
  });

  /**
   * GET /admin/users — 获取用户列表（分页）
   */
  registerSecureRoute(fastify, {
    name: 'listUsers',
    alias: '获取用户列表',
    method: 'GET',
    url: '/admin/users',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      const { limit = 50, offset = 0 } = request.query;
      const users = await UserDao.findAll({ limit: Math.min(Number(limit), 200), offset: Number(offset) });
      return reply.send(users);
    }
  });
}
