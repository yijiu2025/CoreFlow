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
import crypto from 'crypto';
import userDao from '../../../app/user/dao/user.js';
import { emailDao } from '../../../framework/verify/email/index.js';
import { clientContext, sessionIdFromRequest } from '../../../framework/verify/context.js';
import { recaptchaDao } from '../../../framework/verify/recaptcha/index.js';
import verifyConfig from '../../../framework/verify/config.js';
import { getStore } from '../../../framework/redis/index.js';
import emailNoticeService from '../../../framework/notice/services/email.js';
import { v4 as uuidv4 } from 'uuid';
import { logRegister, logAuditEvent } from '../../../framework/auth/audit-logger.js';
import '../../../app/user/permission/roles.js'; // 导入即可触发底层的 defineRoles() 注册机制

/**
 * 计算客户端指纹（IP + UA hash，前 32 hex）
 * 用于 reset token 绑定客户端，防异地冒用
 */
function clientFingerprint(request) {
  const ip = request?.ip || '';
  const ua = request?.headers?.['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

/** 重置密码审计（复用 logAuditEvent，event=PASSWORD_RESET） */
async function auditReset(redis, { email, ip, userAgent, success, reason }) {
  await logAuditEvent(redis, {
    type: success ? 'PASSWORD_RESET_SUCCESS' : 'PASSWORD_RESET_FAILED',
    ip,
    userAgent,
    appId: 'user',
    details: { email: email ? `${email.slice(0, 2)}***@${email.split('@')[1] || ''}` : null, reason }
  });
}

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
        const { code } = request.body;
        await emailDao.verifyCode(email, code, emailCodeStore, {
          ...clientContext(request),
          sessionId: sessionIdFromRequest(request)
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

  /**
   * POST /user/v1/reset-password — 验证码方式重置密码
   *
   * 仅 PASSWORD_RESET_MODE=code 时启用（link 模式下返回 403，防绕过前端调后端）
   * 校验邮箱码（绑 sessionId + 指纹 + 一次性）后，RSA 解密新密码 + 复杂度 + bcrypt 更新。
   */
  registerSecureRoute(fastify, {
    name: 'resetPassword',
    alias: '验证码重置密码',
    method: 'POST',
    url: '/reset-password',
    config: {
      requireSignature: true,
      rateLimit: { max: 5, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      if (verifyConfig.passwordReset.mode !== 'code') {
        return reply.code(403).send({ code: 403, message: '该重置方式未启用', data: null });
      }
      const { email, code, password: encryptedPassword, kid } = request.body;
      const auditCtx = { redis: request.server?.redis, email, ip: request.ip, userAgent: request.headers['user-agent'] || '' };

      // 1. 校验邮箱码（sessionId=captchaKey + 指纹 + 一次性消费）
      try {
        await emailDao.verifyCode(email, code, emailCodeStore, {
          ...clientContext(request),
          sessionId: sessionIdFromRequest(request)
        });
      } catch (err) {
        await auditReset(auditCtx.redis, { ...auditCtx, success: false, reason: `验证码:${err.message}` });
        return reply.result.fail(err.message, null, 400);
      }
      // 2. 更新密码
      try {
        await userDao.updatePassword(email, encryptedPassword, kid);
        await auditReset(auditCtx.redis, { ...auditCtx, success: true, reason: 'by_code' });
        return reply.result.success('密码重置成功');
      } catch (err) {
        await auditReset(auditCtx.redis, { ...auditCtx, success: false, reason: err.message });
        const isBizError = err.message?.startsWith('RESET_FAILED');
        return reply.result.fail(err.message, null, isBizError ? 400 : 500);
      }
    }
  });

  /**
   * POST /user/v1/send-reset-link — 发送密码重置链接到邮箱
   *
   * 安全：
   * - 仅 PASSWORD_RESET_MODE=link 时启用（code 模式下返回 403）
   * - 需先通过图形验证码（captchaKey 必须 verified + 一次性消费，防自动化）
   * - 邮箱未注册也提示"已发送"（防邮箱枚举）
   * - reset token 绑客户端指纹（防异地冒用）
   * - 限频 3次/分/IP
   * - 审计 PASSWORD_RESET_LINK_SENT
   */
  registerSecureRoute(fastify, {
    name: 'sendResetLink',
    alias: '发送密码重置链接',
    method: 'POST',
    url: '/send-reset-link',
    config: {
      requireSignature: true,
      rateLimit: { max: 3, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      if (verifyConfig.passwordReset.mode !== 'link') {
        return reply.code(403).send({ code: 403, message: '该重置方式未启用', data: null });
      }
      const { email, captchaKey } = request.body;
      if (!email || !captchaKey) {
        return reply.result.fail('邮箱和图形验证码不能为空', null, 400);
      }

      // 1. 校验图形验证码已通过（consume：校验 verified 标记 + 一次性删除，与登录密码分支一致）
      //    前端 GraphicCaptcha 调 verify-captcha 已标记 verified，此处消费防复用
      const captchaStore = getStore('captcha');
      const captchaInfo = await captchaStore.get(captchaKey);
      if (!captchaInfo || Date.now() > captchaInfo.expired || captchaInfo.verified !== true) {
        return reply.result.fail('请先完成图形验证', null, 400);
      }
      await captchaStore.delete(captchaKey);

      const auditCtx = { redis: request.server?.redis, email, ip: request.ip, userAgent: request.headers['user-agent'] || '' };

      // 2. 校验邮箱是否注册 + 用户状态（不暴露存在性：未注册/禁用也提示"已发送"）
      const userExists = await userDao.checkEmailExist(email);
      if (userExists) {
        // 3. 生成一次性 reset token（存 Redis，绑 email + 客户端指纹，30min TTL）
        const resetToken = uuidv4();
        const resetStore = getStore('reset_token');
        await resetStore.set(
          resetToken,
          { email, fingerprint: clientFingerprint(request) },
          1800
        );

        // 4. 发送重置链接邮件（SSO_URL 兜底，避免链接无域名）
        const baseUrl = process.env.SSO_URL || process.env.API_BASE_URL || '';
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
        const content = `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2 style="color:#333">密码重置</h2>
            <p>您正在重置密码，请点击下方链接完成操作：</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">重置密码</a>
            </p>
            <p style="font-size:12px;color:#999">或复制此链接到浏览器：${resetUrl}</p>
            <p style="font-size:12px;color:#999">链接 30 分钟内有效，请尽快操作。</p>
            <p style="font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px">如非本人操作，请忽略此邮件。</p>
          </div>`;
        try {
          await emailNoticeService.send(email, '【CoreFlow】密码重置', content);
          await auditReset(auditCtx.redis, { ...auditCtx, success: true, reason: 'link_sent' });
        } catch (err) {
          console.warn('[ResetLink] 邮件发送失败:', err.message);
          await auditReset(auditCtx.redis, { ...auditCtx, success: false, reason: '邮件发送失败' });
        }
      } else {
        // 未注册：不生成 token，但记录审计（便于监控枚举尝试）
        await auditReset(auditCtx.redis, { ...auditCtx, success: false, reason: '邮箱未注册' });
      }
      // 无论是否注册都返回"已发送"（防邮箱枚举）
      return reply.result.success('重置链接已发送至邮箱（如该邮箱已注册）');
    }
  });

  /**
   * POST /user/v1/reset-password-by-link — 通过链接 token 重置密码
   *
   * 仅 PASSWORD_RESET_MODE=link 时启用（code 模式下返回 403）
   * 校验 reset token 有效性 + 指纹一致后，RSA 解密新密码 + 更新。
   */
  registerSecureRoute(fastify, {
    name: 'resetPasswordByLink',
    alias: '链接重置密码',
    method: 'POST',
    url: '/reset-password-by-link',
    config: {
      requireSignature: true,
      rateLimit: { max: 5, timeWindow: '1 minute' }
    },
    handler: async (request, reply) => {
      if (verifyConfig.passwordReset.mode !== 'link') {
        return reply.code(403).send({ code: 403, message: '该重置方式未启用', data: null });
      }
      const { token, password: encryptedPassword, kid } = request.body;
      if (!token || !encryptedPassword) {
        return reply.result.fail('token 和新密码不能为空', null, 400);
      }

      const auditCtx = { redis: request.server?.redis, ip: request.ip, userAgent: request.headers['user-agent'] || '' };

      const resetStore = getStore('reset_token');
      const data = await resetStore.get(token);
      if (!data) {
        await auditReset(auditCtx.redis, { ...auditCtx, email: null, success: false, reason: 'token 无效或已过期' });
        return reply.result.fail('重置链接已失效，请重新申请', null, 400);
      }

      // 指纹一致性校验（防 reset token 被异地冒用——邮件链接泄露后异地带 token 换密码）
      const currentFp = clientFingerprint(request);
      if (data.fingerprint && data.fingerprint !== currentFp) {
        // 指纹不符：疑似冒用，删除 token（一次性，防攻击者重试）+ 审计
        await resetStore.delete(token);
        await auditReset(auditCtx.redis, { ...auditCtx, email: data.email, success: false, reason: '指纹不符（疑似异地冒用）' });
        return reply.result.fail('重置链接已失效，请重新申请', null, 400);
      }

      // 一次性消费（先删 token 再改密码，防并发重复使用）
      await resetStore.delete(token);

      // 更新密码（含用户状态校验、复杂度、bcrypt 哈希）
      try {
        await userDao.updatePassword(data.email, encryptedPassword, kid);
        await auditReset(auditCtx.redis, { ...auditCtx, email: data.email, success: true, reason: 'by_link' });
        return reply.result.success('密码重置成功');
      } catch (err) {
        await auditReset(auditCtx.redis, { ...auditCtx, email: data.email, success: false, reason: err.message });
        const isBizError = err.message?.startsWith('RESET_FAILED');
        return reply.result.fail(err.message, null, isBizError ? 400 : 500);
      }
    }
  });
}
