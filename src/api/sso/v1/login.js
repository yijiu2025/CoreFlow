import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import Result from '../../../core/result.js';
import { SsoUserDao } from '../../../dao/sso/sso-user.js';

const ssoUserDao = new SsoUserDao();

export default async function (fastify, opts) {
  // 1. 注册模块级配置 (Level 2)
  registerGroupMetadata('sso', 'auth', {
    name: '统一认证模块',
    description: '处理 SSO 登录、凭证分发及重定向跳转逻辑。',
    enabled: true,
    requireLogin: false
  });

  /**
   * 2. API 级配置 (Level 3)
   */
  registerSecureRoute(fastify, {
    method: 'post',
    url: '/api/v1/sso/login',
    system: 'sso',
    group: 'auth',
    api: 'login',
    alias: 'SSO 统一登录入口',
    handler: async (request, reply) => {
      const ctx = { request, reply, state: request.state };
      
      // 业务逻辑，任何异常直接抛出，由全局拦截器打包为 Result.fail 返回
      const ticket = await ssoUserDao.getSsoTicket(ctx, { data: request.body });
      const { redirectUri } = request.body;
      return reply.result.success('登录成功', {
        ticket,
        redirectUrl: redirectUri ? `${redirectUri}?ticket=${ticket}` : null
      });
    }
  });
}
