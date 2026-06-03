import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { captchaDao } from '../../../verify/captcha/index.js';
import { emailDao } from '../../../verify/email/index.js';
import { getSessionStore } from '../../../redis/session-store.js';
import { generateCaptchaSchema, verifyCaptchaSchema } from './schemas.js';

export default async function (fastify, opts) {
  const captchaStore = getSessionStore(fastify, 'captcha');
  const emailCodeStore = getSessionStore(fastify, 'email_code');

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
      reply.header(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );

      const result = await captchaDao.generate(captchaStore);
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
        const result = await captchaDao.verifyAndSendEmail(
          request.body,
          captchaStore,
          emailCodeStore,
          (email, sessionId, store) => emailDao.sendCode(email, sessionId, store)
        );
        return reply.result.success(result.message, {
          emailSent: result.emailSent
        });
      } catch (err) {
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
        await emailDao.verifyCode(email, code, emailCodeStore);
        return reply.result.success('验证码校验通过');
      } catch (err) {
        return reply.result.fail(err.message, null, 400);
      }
    }
  });
}
