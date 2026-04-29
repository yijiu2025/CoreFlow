import { xToken } from '../../../auth/xToken.js';
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify, opts) {
  // 1. 注册模块级配置 (Level 2)
  registerGroupMetadata('token', {
    system: 'auth',
    name: '身份令牌模块',
    description: '负责签发、验证与撤销用户访问令牌，提供 SSO 与 OSS 授权支持。',
    enabled: true,
    requireLogin: false
  });

  /**
   * 2. API 级配置 (Level 3)
   */
  registerSecureRoute(fastify, {
    name: 'login',
    alias: '用户登录 (主入口)',
    method: 'POST',
    url: '/api/v1/auth/login',
    handler: async (request, reply) => {
      const { username, password } = request.body;
      const account = await request.server.db.sso.SsoUser.findOne({ where: { username } });

      if (!account || account.password !== password) {
        const err = new Error('用户名或密码错误');
        err.statusCode = 401;
        throw err;
      }

      if (account.status === 0) {
        const err = new Error('账号已被禁用');
        err.statusCode = 403;
        throw err;
      }

      const ctx = { request, reply, state: request.state };
      return global.als.run(ctx, () => {
        const token = xToken.login(account.uid, { username: account.username, role: 'user' });
        return Result.success('登录成功', { token, username: account.username });
      });
    }
  });

  registerSecureRoute(fastify, {
    name: 'oss',
    alias: 'OSS 异步上传凭证',
    method: 'GET',
    url: '/api/v1/auth/oss-token',
    requireLogin: true,
    handler: async (request, reply) => {
      const ctx = { request, reply, state: request.state };
      return global.als.run(ctx, () => {
        try {
          const user = xToken.check();
          const uploadDir = `uploads/user_${user.uid}/${new Date().toISOString().slice(0, 10)}/`;
          const policy = xToken.oss.getUploadPolicy(uploadDir);
          return Result.success('操作成功', policy);
        } catch (err) {
          err.statusCode = 500;
          err.message = `OSS 授权失败: ${err.message}`;
          throw err;
        }
      });
    }
  });

  registerSecureRoute(fastify, {
    name: 'logout',
    alias: '安全退出登录',
    method: 'POST',
    url: '/api/v1/auth/logout',
    handler: async (request, reply) => {
      reply.clearCookie('token');
      return Result.success('已安全退出');
    }
  });
}
