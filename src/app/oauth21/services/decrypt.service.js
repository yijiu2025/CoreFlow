/**
 * RSA 解密与请求验证工具
 *
 * 从 login.js 中提取，处理：
 * - RSA 解密
 * - 时间戳验证
 * - Nonce 防重放
 * - 验证码校验
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { decrypt, validateTimestamp } from '../crypto/encryption.js';
import { captchaService } from '../../../framework/verify/captcha/index.js';
import { emailDao } from '../../../framework/verify/email/index.js';
import { getStore, createNonceStore } from '../../../framework/redis/index.js';

// nonce 去重存储（延迟初始化，通过 app 引用自动感知 failover 切换）
let nonceStore = null;

function ensureNonceStore(request) {
  if (!nonceStore) {
    nonceStore = createNonceStore();
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
  const { encrypted, timestamp, nonce, captchaKey, kid } = request.body;

  // 1. 验证码校验
  if (captchaKey) {
    const captchaStore = getStore('captcha');
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

    // Nonce 防重放（使用原子 checkAndMark 消除并发窗口）
    const store = ensureNonceStore(request);
    if (!nonce || (await store.checkAndMark(nonce))) {
      return { success: false, error: '重放攻击检测：nonce 无效', statusCode: 400 };
    }

    // 解密
    try {
      const decrypted = await decrypt(encrypted, kid);
      const payload = JSON.parse(decrypted);
      return {
        success: true,
        data: {
          username: payload.username,
          password: payload.password,
          type: payload.type,
          email: payload.email,
          code: payload.code,
          keepLogin: payload.keepLogin !== false, // 默认 true（未传按记住我处理，保现行为）
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
/**
 * 校验邮箱验证码（登录场景，绑定客户端指纹防异地冒用）
 * @param {string} email - 邮箱
 * @param {string} code - 验证码
 * @param {object} request - Fastify request（用于校验 IP+UA 指纹一致性）
 * @returns {object} { success?, error? }
 */
export async function verifyEmailCode(email, code, request) {
  const emailCodeStore = getStore('email_code');
  try {
    await emailDao.verifyCode(email, code, emailCodeStore, {
      ip: request?.ip,
      ua: request?.headers?.['user-agent'] || '',
      deviceFp: request?.headers?.['x-device-fp'] || ''
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || '验证码错误或已过期' };
  }
}
