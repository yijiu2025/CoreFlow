/**
 * User 用户注册
 *
 * POST /user/register — 注册新用户
 * GET /check-email — 校验邮箱是否重复
 * GET /check-username — 校验用户名是否重复
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import userDao from '../../../app/user/dao/user.js';
import { emailDao } from '../../../framework/verify/email/index.js';
import { recaptchaDao } from '../../../framework/verify/recaptcha/index.js';
import verifyConfig from '../../../framework/verify/config.js';
import { getStore } from '../../../framework/redis/index.js';
import { logRegister } from '../../../framework/auth/audit-logger.js';
import '../../../app/user/permission/roles.js'; // 导入即可触发底层的 defineRoles() 注册机制

export default async function (fastify) {
  const emailCodeStore = getStore('email_code');

  registerGroupMetadata({
    name: 'userRegister',
    description: 'user用户注册',
    prefix: '/v1',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /user/register — 注册新用户
   *
   * 安全：requireSignature=true（与登录接口安全级别一致，防绕过前端直接调用）
   *      邮箱验证码 + 邮箱唯一约束兜底，H5 签名防自动化灌水
   */
  registerSecureRoute(fastify, {
    name: 'userRegister',
    alias: '注册新用户',
    method: 'POST',
    url: '/register',
    // requireSignature 放 config 内（routeConfig = {...config} 展开，verifySignature 读 routeConfig.requireSignature）
    config: {
      requireSignature: true,
      // 端点级限频：单 IP 5 次/分钟，防注册接口被高频刷
      rateLimit: { max: 5, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      const { email } = request.body;
      const auditCtx = {
        redis: request.server?.redis,
        email,
        ip: request.ip,
        userAgent: request.headers['user-agent'] || '',
        appId: 'user'
      };

      // 人机验证（仅 RECAPTCHA_ENABLED=true 时校验，防注册接口被脚本灌水）
      if (verifyConfig.recaptcha.enabled) {
        const { recaptchaToken } = request.body;
        const valid = await recaptchaDao.isValid(recaptchaToken, request.ip);
        if (!valid) {
          await logRegister(auditCtx.redis, { ...auditCtx, success: false, reason: '人机验证失败' });
          return reply.result.fail('人机验证失败，请重试', null, 400);
        }
      }

      // 验证邮件验证码（绑定客户端指纹 + sessionId 一致性，防异地冒用 + 跨流程复用）
      try {
        const { code, captchaKey } = request.body;
        await emailDao.verifyCode(email, code, emailCodeStore, {
          ip: request.ip,
          ua: request.headers['user-agent'] || '',
          deviceFp: request.headers['x-device-fp'] || '',
          sessionId: captchaKey
        });
      } catch (err) {
        await logRegister(auditCtx.redis, { ...auditCtx, success: false, reason: err.message });
        return reply.result.fail(err.message, null, 400);
      }

      // createUser 失败（邮箱已存在/复杂度不足/guest 缺失）抛错，审计失败 + 400
      try {
        const user = await userDao.createUser(request);
        await logRegister(auditCtx.redis, {
          ...auditCtx,
          userId: user?.numericId || user?.id,
          success: true
        });
        // L5：字段最小化，注册只返回成功标识，uid/email 等登录后从 user 信息接口取
        return reply.result.success('注册成功', {
          username: user?.username
        });
      } catch (err) {
        await logRegister(auditCtx.redis, { ...auditCtx, success: false, reason: err.message });
        const isBizError = err.message?.startsWith('REGISTER_FAILED') || err.message?.startsWith('NOT_FOUND');
        return reply.result.fail(err.message, null, isBizError ? 400 : 500);
      }
    }
  });

  /**
   * GET /check-email — 校验邮箱是否重复
   *
   * 安全：requireSignature=true + 限频，防账号枚举（避免攻击者无限探测邮箱存在性）
   */
  registerSecureRoute(fastify, {
    name: 'checkEmail',
    alias: '校验邮箱是否重复',
    method: 'GET',
    url: '/check-email',
    config: {
      requireSignature: true,
      // 端点级限频：单 IP 10 次/分钟，抑制自动化枚举
      rateLimit: { max: 10, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      const { email } = request.query;
      const isDuplicate = await userDao.checkEmailExist(email);
      return reply.code(200).send({ isDuplicate });
    }
  });
}
