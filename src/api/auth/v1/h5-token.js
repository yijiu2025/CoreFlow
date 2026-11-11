/**
 * H5 签名 Token 预发路由
 *
 * GET /auth/v1/h5-token — 预发 _m_h5_tk cookie，供前端请求拦截器计算 H5 签名
 *
 * 🔴 2026-11-10 起**仅已登录才签发**：匿名调用返回 `issued:false` 且不写任何键。
 *    原因：本端点曾是页面加载必经之路（`oauth21/src/bootstrap.ts`），未登录也签发，
 *    于是每次刷新都多一个 `h5_token:*` 键（1h TTL），一个用户一小时几十个 —— 而这些键
 *    不承载任何身份，纯属写放大。未登录请求的访问控制由登录守卫（401）+ 端点限频承担。
 *
 * 安全：端点公开（不 requireLogin），但匿名不再产生副作用；限频继续保留。
 *
 * @author yijiu2025
 * @since 2026-08-27
 * @since 2026-11-10 未登录不签发（只回 issued:false）
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { issueH5Token } from '../../../framework/security/auth/index.js';

async function registerH5TokenRoutes(fastify) {
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
        timeWindow: '1 minute',
        // 计数隔离：@fastify/rate-limit 默认所有端点共用同一个 rate:ip:<ip> 键，
        // 其它端点的流量会吃掉本端点额度（反之亦然）。groupId 让 key 追加路由
        // 维度后缀，本端点 30 次/分钟独立核算，不受 NAT 出口上其它端点流量连带。
        groupId: 'h5-token'
      }
    },
    handler: async (request, reply) => {
      // 未登录：不签发、不落库（见文件头）
      if (!request.state?.user) {
        return { code: 200, message: 'anonymous', data: { issued: false } };
      }
      await issueH5Token(fastify, reply);
      return { code: 200, message: 'ok', data: { issued: true } };
    }
  });
}

export default registerH5TokenRoutes;
