/**
 * 人机挑战路由
 *
 * POST /api/firewall/v1/challenge/verify — 提交验证结果
 *
 * 业务逻辑见 app/firewall/services/challenge.service.js（verifyChallenge）。
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { verifyChallenge } from '../../../app/firewall/services/challenge.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'challenge',
    alias: '人机验证模块',
    description: '负责浏览器挑战（Bot Challenge）的签发与验证，防止自动化脚本攻击。',
    prefix: '/v1/challenge',
    enabled: true,
    requireLogin: false, // 挑战验证本身不需要登录
    allowIps: [],
    allowRoles: []
  });

  /**
   * POST /api/firewall/v1/challenge/verify — 提交验证结果
   */
  registerSecureRoute(fastify, {
    name: 'verify',
    alias: '提交验证结果',
    method: 'POST',
    url: '/verify',
    handler: async (request, reply) => {
      const result = await verifyChallenge(request, reply);
      if (!result.ok) {
        return reply.code(result.statusCode).send({ ok: false, reason: result.reason });
      }
      return { ok: true };
    }
  });
}
