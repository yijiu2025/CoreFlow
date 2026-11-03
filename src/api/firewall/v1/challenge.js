/**
 * 人机挑战路由
 *
 * POST /api/firewall/v1/challenge/issue  — 为 Vue 挑战页签发一份挑战（JSON）
 * POST /api/firewall/v1/challenge/verify — 提交验证结果
 *
 * 业务逻辑见 app/firewall/services/challenge.service.js（issueChallenge / verifyChallenge）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-03 新增 issue：前端 Vue 挑战页需要的 JSON 签发入口（内置 HTML 模板仍保留）
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { issueChallenge, verifyChallenge } from '../../../app/firewall/services/challenge.service.js';

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
   * POST /api/firewall/v1/challenge/issue — 为 Vue 挑战页签发挑战
   *
   * 免登录、独立限频：每签一次都是一次 Redis 写入（载荷 TTL 300s），
   * 必须自己成桶，否则被刷就把 Redis 当写放大用。10 次/分钟对正常用户绰绰有余
   * （一次验证只需要 1 份载荷，失败重试也远低于这个量）。
   */
  registerSecureRoute(fastify, {
    name: 'issue',
    alias: '签发挑战',
    method: 'POST',
    url: '/issue',
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute', groupId: 'challenge-issue' }
    },
    requireLogin: false,
    schema: {
      // 无入参：绑定上下文一律由服务端从请求本身取（IP / 指纹 / 设备 ID），
      // 绝不能让客户端"指定"绑定维度，否则挑战可以跨上下文复用。
      body: { type: 'object', properties: {}, additionalProperties: true }
    },
    handler: async (request, reply) => {
      const result = await issueChallenge(request);
      if (!result.ok) {
        return reply.code(result.statusCode).send({ ok: false, reason: result.reason });
      }
      return result;
    }
  });

  /**
   * POST /api/firewall/v1/challenge/verify — 提交验证结果
   */
  registerSecureRoute(fastify, {
    name: 'verify',
    alias: '提交验证结果',
    method: 'POST',
    url: '/verify',
    // 防滥用：该端点公开且会消耗凭证/CPU，按 IP+用户维度独立计数（groupId 与其它端点隔离）
    config: {
      rateLimit: { max: 20, timeWindow: '1 minute', groupId: 'challenge-verify' }
    },
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
