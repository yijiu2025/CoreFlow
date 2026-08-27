/**
 * H5 签名 Token 预发路由
 *
 * GET /auth/v1/h5-token — 预发 _m_h5_tk cookie，供前端请求拦截器计算 H5 签名
 *
 * 用途：未登录场景（如 QR 生成）也需要签名防爬，但前端无 _m_h5_tk cookie
 * 无法算签名。页面加载时先调此端点拿 cookie，后续请求即可签名。
 *
 * 安全：端点公开（不 requireLogin），但配合限频防滥用。
 *
 * @author yijiu2025
 * @since 2026-08-27
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { issueH5Token } from '../../../framework/auth/signature.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'h5token',
    alias: 'H5签名Token',
    description: '预发 H5 签名密钥 cookie',
    prefix: '/v1',
    requireLogin: false,
    allowRoles: []
  });

  registerSecureRoute(fastify, {
    name: 'issueH5Token',
    alias: '预发H5签名Token',
    method: 'GET',
    url: '/h5-token',
    requireLogin: false,
    config: {
      rateLimit: {
        max: 30, // 每分钟 30 次，防滥用
        timeWindow: '1 minute'
      }
    },
    handler: async (request, reply) => {
      await issueH5Token(fastify, reply);
      return { code: 200, message: 'ok', data: { issued: true } };
    }
  });
}
