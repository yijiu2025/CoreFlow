/**
 * 验证码路由
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { captchaDao } from '../../../framework/verify/captcha/index.js';
import { emailDao } from '../../../framework/verify/email/index.js';
import { clientContext, sessionIdFromRequest } from '../../../framework/verify/context.js';
import { getStore } from '../../../framework/redis/index.js';
import { generateCaptchaSchema, verifyCaptchaSchema } from './schemas/verify.js';

export default async function (fastify, opts) {
  const captchaStore = getStore('captcha');
  const emailCodeStore = getStore('email_code');

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

      // generate 时绑客户端指纹，verify/consume 时校验同一客户端（防 tag 盗用绕过）
      const result = await captchaDao.generate(captchaStore, {}, clientContext(request));
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
          // 发码时绑定客户端指纹（IP+UA，启用时含 device 指纹），用码时回查一致性
          (email, sessionId, store) =>
            emailDao.sendCode(email, sessionId, store, clientContext(request)),
          // captchaKey 指纹校验：必须与 generate 时同一客户端
          clientContext(request)
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
   *
   * 注意：本端点会消费验证码（一次性，校验后 store.delete）。
   * 注册流程（/user/v1/register）内部已调 emailDao.verifyCode 校验邮箱码，
   * 勿在 register 前调本端点，否则验证码被消费导致注册失败。
   * 本端点仅用于独立校验场景（如前端"验证码是否正确"实时提示）。
   */
  registerSecureRoute(fastify, {
    name: 'checkEmailCode',
    alias: '校验邮箱验证码',
    method: 'POST',
    url: '/check-email-code',
    handler: async (request, reply) => {
      const { email, code } = request.body;
      try {
        await emailDao.verifyCode(email, code, emailCodeStore, {
          ...clientContext(request),
          sessionId: sessionIdFromRequest(request)
        });
        return reply.result.success('验证码校验通过');
      } catch (err) {
        return reply.result.fail(err.message, null, 400);
      }
    }
  });

  /**
   * POST /send-login-verify-code — 密码登录二次验证专用发码
   *
   * 不需图形码（用户已过登录图形码）。凭 verifyToken 从 Redis 查 email 发码，
   * verifyToken 由 directLogin 环境异常时签发（login_email_verify store，5min TTL）。
   */
  registerSecureRoute(fastify, {
    name: 'sendLoginVerifyCode',
    alias: '发送登录二次验证邮箱码',
    method: 'POST',
    url: '/send-login-verify-code',
    handler: async (request, reply) => {
      const { verifyToken } = request.body;
      if (!verifyToken) {
        return reply.result.fail('verifyToken 不能为空', null, 400);
      }
      const verifyStore = getStore('login_email_verify');
      const data = await verifyStore.get(verifyToken);
      if (!data || !data.email) {
        return reply.result.fail('验证令牌已过期，请重新登录', null, 400);
      }
      try {
        await emailDao.sendCode(data.email, verifyToken, emailCodeStore, {
          ip: request.ip,
          ua: request.headers['user-agent'] || ''
        });
        return reply.result.success('验证码已发送');
      } catch (err) {
        return reply.result.fail(err.message, null, 400);
      }
    }
  });
}
