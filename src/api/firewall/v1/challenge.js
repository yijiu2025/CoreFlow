import crypto from 'crypto';
import { CHALLENGE_SECRET } from '../../../firewall/config.js';
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  // 1. 注册模块级元数据 (Level 2)
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
   * 2. 注册 API 级配置 (Level 3)
   * 验证浏览器提交的挑战结果
   */
  registerSecureRoute(fastify, {
    name: 'verify',
    alias: '提交验证结果',
    method: 'POST',
    url: '/verify',
    handler: async (request, reply) => {
      const { nonce, timestamp, signature, webgl, webdriver, plugins } = request.body;

      // 1. 签名验证
      const expected = crypto
        .createHmac('sha256', CHALLENGE_SECRET)
        .update(`${request.ip}:${nonce}:${timestamp}`)
        .digest('hex');

      if (signature !== expected) {
        return reply.code(403).send({ ok: false, reason: 'Signature Mismatch' });
      }

      // 2. 时效性验证 (5分钟)
      if (Date.now() - timestamp > 5 * 60 * 1000) {
        return reply.code(403).send({ ok: false, reason: 'Challenge Expired' });
      }

      // 3. 浏览器指纹检查
      if (!webgl || webdriver || plugins === 0) {
        return reply.code(403).send({ ok: false, reason: 'Suspicious Environment' });
      }

      // 4. 签发验证令牌 (存入 Redis)
      const token = crypto.randomBytes(32).toString('hex');
      if (fastify.redis) {
        await fastify.redis.set(`fw:pass:${request.ip}:${token}`, '1', 'EX', 1800);
      }

      // 5. 设置 HttpOnly Cookie
      reply.setCookie('fw_verified', token, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1800,
        sameSite: 'Strict'
      });

      return { ok: true };
    }
  });
}
