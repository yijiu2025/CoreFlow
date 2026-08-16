/**
 * OAuth 2.1 客户端与权限管理（管理端）
 *
 * 从 oauth21 域迁出：原挂在 /oauth2.1/admin/*（与公开授权端点同前缀，安全边界混乱）。
 * 现落 /admin/v1/oauth21/*，继承 admin 域 system 级 requireLogin:true，
 * 并叠加 group/route 级 allowRoles:['admin']，与 iam.js 同构。
 *
 * 注：用户列表（listUsers）不在此处，已迁至 user 域 /user/v1/admin/list（用户管理本属 user）。
 *
 * POST /admin/v1/oauth21/permissions/sync — 子应用上报权限点
 * POST /admin/v1/oauth21/client              — 创建 OAuth 客户端
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import ClientDao from '../../../app/oauth21/dao/client.dao.js';
import PermissionDao from '../../../app/oauth21/dao/permission.dao.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'oauth21-admin',
    alias: 'OAuth 客户端与权限管理',
    description: 'OAuth 客户端创建、权限同步',
    prefix: '/v1',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * POST /admin/v1/oauth21/permissions/sync — 权限同步接口
   * 供子应用启动时自动上报权限点
   */
  registerSecureRoute(fastify, {
    name: 'syncPermissions',
    alias: '权限同步',
    method: 'POST',
    url: '/oauth21/permissions/sync',
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
   * POST /admin/v1/oauth21/client — 创建 OAuth 客户端
   */
  registerSecureRoute(fastify, {
    name: 'createClient',
    alias: '创建客户端',
    method: 'POST',
    url: '/oauth21/client',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (request, reply) => {
      // 只允许指定字段，防止注入
      const { client_name, redirect_uris, grant_types, scope, token_endpoint_auth_method, application_type } =
        request.body;
      const client = await ClientDao.create({
        client_name,
        redirect_uris,
        grant_types,
        scope,
        token_endpoint_auth_method,
        application_type
      });
      return reply.code(201).send(client);
    }
  });
}
