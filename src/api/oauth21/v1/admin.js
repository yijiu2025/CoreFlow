import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import ClientDao from '../../../app/oauth21/dao/client.dao.js';
import UserDao from '../../../app/oauth21/dao/user.dao.js';
import PermissionDao from '../../../app/oauth21/dao/permission.dao.js';

export default async function (fastify) {
  // 🔐 安全头处理：允许特定页面被 iframe 嵌入
  fastify.addHook('onSend', (request, reply, payload, done) => {
    if (request.url.includes('mini-login')) {
      reply.header('X-Frame-Options', 'ALLOWALL');
      reply.header('Content-Security-Policy', "frame-ancestors 'self' *");
    }
    done();
  });

  registerGroupMetadata({
    name: 'admin',
    description: 'OAuth 客户端与用户管理',
    enabled: true,
    requireLogin: true
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
    handler: async (request, reply) => {
      const { appId, permissions } = request.body;
      
      if (!appId || !Array.isArray(permissions)) {
        return reply.code(400).send({ error: '无效的同步数据' });
      }

      // TODO: 校验 appId 和对应密钥的合法性
      
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
    handler: async (request, reply) => {
      const client = await ClientDao.create(request.body);
      return reply.code(201).send(client);
    }
  });

  /**
   * GET /admin/users — 获取用户列表
   */
  registerSecureRoute(fastify, {
    name: 'listUsers',
    alias: '获取用户列表',
    method: 'GET',
    url: '/admin/users',
    handler: async (request, reply) => {
      const users = await UserDao.findAll();
      return reply.send(users);
    }
  });
}
