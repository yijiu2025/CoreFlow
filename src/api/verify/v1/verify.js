import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import verifyDao from '../../../verify/dao/verify.js';
import { getSessionStore } from '../../../redis/session-store.js';

// 复用之前的 Schema (可以根据需要移动到 verify 目录下)
import { generateCaptchaSchema, verifyCaptchaSchema } from '../../oauth21/v1/schemas.js';

export default async function (fastify, opts) {
  const captchaStore = getSessionStore(fastify, 'captcha');

  registerGroupMetadata({
    name: 'v1',
    description: '基础验证接口 v1',
    prefix: '/v1',
    enabled: true,
    requireLogin: false
  });

  /**
   * GET /generate-captcha — 生成图形验证码
   */
  registerSecureRoute(fastify, {
    name: 'generateCaptcha',
    alias: '生成图形验证码',
    method: 'GET',
    url: '/generate-captcha',
    schema: generateCaptchaSchema,
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      
      const result = await verifyDao.generateCaptcha(captchaStore);
      return reply.result.success('验证码生成成功', result);
    }
  });

  /**
   * POST /verify-captcha — 校验图形验证码 (并可选发送邮件)
   */
  registerSecureRoute(fastify, {
    name: 'verifyCaptcha',
    alias: '校验验证码并发送邮件',
    method: 'POST',
    url: '/verify-captcha',
    schema: verifyCaptchaSchema,
    handler: async (request, reply) => {
      try {
        const result = await verifyDao.verifyCaptchaAndSendEmail(request.body, captchaStore);
        return reply.result.success(result.message, { emailSent: result.emailSent });
      } catch (err) {
        // 捕获业务逻辑错误并返回 400
        return reply.result.fail(err.message, null, 400);
      }
    }
  });

  /**
   * POST /check-email-code — 仅校验邮箱验证码
   */
  registerSecureRoute(fastify, {
    name: 'checkEmailCode',
    alias: '校验邮箱验证码',
    method: 'POST',
    url: '/check-email-code',
    handler: async (request, reply) => {
      const { email, code } = request.body;
      try {
        await verifyDao.checkEmailCode(email, code);
        return reply.result.success('验证码校验通过');
      } catch (err) {
        return reply.result.fail(err.message, null, 400);
      }
    }
  });
}
