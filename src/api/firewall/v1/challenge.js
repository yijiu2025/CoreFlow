/**
 * 人机挑战路由
 *
 * POST /api/firewall/v1/challenge/verify — 提交验证结果
 *
 * 业务逻辑见 app/firewall/services/challenge.service.js（verifyChallenge）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { verifyChallenge } from '../../../app/firewall/services/challenge.service.js';

async function registerChallengeRoutes(fastify) {
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
    // 本组必须保持免登录：被挑战的请求正是**尚未通过验证**的请求，
    // 若这里要求登录，挑战就永远解不开（见 docs/AUDIT-REPORT-2026-09-15.md 🔴-1）。
    // system 级 requireLogin 已改为 false，本组的声明因此才真正生效。
    requireLogin: false,
    schema: {
      body: {
        type: 'object',
        required: ['challengeId', 'answer'],
        properties: {
          challengeId: { type: 'string', pattern: '^[0-9a-f]{32}$' },
          answer: { type: 'string', minLength: 1, maxLength: 10 }
        }
      }
    },
    handler: async (request, reply) => {
      const result = await verifyChallenge(request, reply);
      if (!result.ok) {
        return reply.code(result.statusCode).send({ ok: false, reason: result.reason });
      }
      return { ok: true };
    }
  });
}

export default registerChallengeRoutes;
