/**
 * RSA 解密与请求验证工具
 *
 * 从 login.js 中提取，处理：
 * - RSA 解密
 * - 时间戳验证
 * - Nonce 防重放
 * - 验证码校验
 */

import {
  decrypt,
  validateTimestamp
} from '../../../../app/oauth21/crypto/encryption.js';
import { captchaService } from '../../../../verify/captcha/index.js';
import { emailDao } from '../../../../verify/email/index.js';
import { getSessionStore } from '../../../../redis/session-store.js';
import { createNonceStore } from '../../../../redis/nonce-store.js';

// nonce 去重存储（延迟初始化）
let nonceStore = null;

function ensureNonceStore(request) {
  if (!nonceStore) {
    nonceStore = createNonceStore(request.server?.redis || null);
  }
  return nonceStore;
}

/**
 * 解密登录请求
 * @param {object} request - Fastify request
 * @param {object} fastify - Fastify 实例
 * @returns {object} { success, data?, error?, statusCode? }
 */
export async function decryptLoginRequest(request, fastify) {
  const { encrypted, timestamp, nonce, captchaKey } = request.body;

  // 1. 验证码校验
  if (captchaKey) {
    const captchaStore = getSessionStore(fastify, 'captcha');
    const isVerified = await captchaService.consume(captchaKey, captchaStore);
    if (!isVerified) {
      return { success: false, error: '请先完成图形验证', statusCode: 400 };
    }
  }

  // 2. RSA 加密路径
  if (encrypted) {
    // 时间戳校验
    if (!validateTimestamp(timestamp)) {
      return { success: false, error: '请求时间戳异常', statusCode: 400 };
    }

    // Nonce 防重放
    const store = ensureNonceStore(request);
    if (!nonce || (await store.check(nonce))) {
      return { success: false, error: '重放攻击检测：nonce 无效', statusCode: 400 };
    }
    await store.mark(nonce);

    // 解密
    try {
      const decrypted = decrypt(encrypted);
      const payload = JSON.parse(decrypted);
      return {
        success: true,
        data: {
          username: payload.username,
          password: payload.password,
          type: payload.type,
          email: payload.email,
          code: payload.code,
          oidcNonce: request.body.oidcNonce
        }
      };
    } catch {
      return { success: false, error: '解密失败或格式错误', statusCode: 400 };
    }
  }

  // 3. 邮箱验证码登录（不需要加密）
  const { type, email, code, username: plainUsername, password: plainPassword } = request.body;

  if (type === 'email') {
    if (!email || !code) {
      return { success: false, error: '邮箱和验证码不能为空', statusCode: 400 };
    }
    return {
      success: true,
      data: { type, email, code, oidcNonce: request.body.oidcNonce }
    };
  }

  // 4. 密码登录必须加密
  if (plainUsername || plainPassword) {
    return { success: false, error: '密码登录必须使用 RSA 加密传输', statusCode: 400 };
  }

  return { success: false, error: '无效的登录请求', statusCode: 400 };
}

/**
 * 验证邮箱验证码
 * @param {string} email - 邮箱
 * @param {string} code - 验证码
 * @param {object} fastify - Fastify 实例
 * @returns {object} { success?, error? }
 */
export async function verifyEmailCode(email, code, fastify) {
  const emailCodeStore = getSessionStore(fastify, 'email_code');
  try {
    await emailDao.verifyCode(email, code, emailCodeStore);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || '验证码错误或已过期' };
  }
}
