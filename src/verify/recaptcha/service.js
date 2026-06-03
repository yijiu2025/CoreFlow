/**
 * 人机验证核心服务
 * 对接 Google reCAPTCHA / hCaptcha API
 */
import config from '../config.js';

const recaptchaConfig = config.recaptcha;

/** 验证结果 */
export const VERIFY_RESULT = {
  SUCCESS: 'success',
  FAIL: 'fail',
  ERROR: 'error'
};

class RecaptchaService {
  /**
   * 验证 reCAPTCHA token
   * @param {string} token 前端传入的 reCAPTCHA token
   * @param {string} [remoteIp] 客户端 IP（可选）
   * @returns {Promise<{success: boolean, score?: number, error?: string}>}
   */
  async verify(token, remoteIp) {
    if (!token) {
      return { success: false, error: 'token_required' };
    }

    const provider = recaptchaConfig.provider;

    switch (provider) {
      case 'google':
        return await this._verifyGoogle(token, remoteIp);
      case 'hcaptcha':
        return await this._verifyHcaptcha(token, remoteIp);
      default:
        console.warn(`[Recaptcha] 未知服务商: ${provider}，跳过验证`);
        return { success: true };
    }
  }

  /**
   * Google reCAPTCHA 验证
   * @private
   */
  async _verifyGoogle(token, remoteIp) {
    const secretKey = recaptchaConfig.secretKey;
    if (!secretKey) {
      console.warn('[Recaptcha] RECAPTCHA_SECRET_KEY 未配置，跳过验证');
      return { success: true };
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token
      });
      if (remoteIp) params.append('remoteip', remoteIp);

      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: params
      });

      const data = await res.json();

      if (!data.success) {
        return {
          success: false,
          error: data['error-codes']?.join(', ') || 'verification_failed'
        };
      }

      // reCAPTCHA v3 有 score（0.0-1.0）
      const minScore = recaptchaConfig.minScore;
      if (data.score !== undefined && data.score < minScore) {
        return { success: false, score: data.score, error: 'score_too_low' };
      }

      return { success: true, score: data.score };
    } catch (err) {
      console.error('[Recaptcha] Google API 请求失败:', err.message);
      return { success: false, error: 'api_error' };
    }
  }

  /**
   * hCaptcha 验证
   * @private
   */
  async _verifyHcaptcha(token, remoteIp) {
    const secretKey = recaptchaConfig.secretKey;
    if (!secretKey) {
      console.warn('[Recaptcha] RECAPTCHA_SECRET_KEY 未配置，跳过验证');
      return { success: true };
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token
      });
      if (remoteIp) params.append('remoteip', remoteIp);

      const res = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        body: params
      });

      const data = await res.json();

      if (!data.success) {
        return {
          success: false,
          error: data['error-codes']?.join(', ') || 'verification_failed'
        };
      }

      return { success: true };
    } catch (err) {
      console.error('[Recaptcha] hCaptcha API 请求失败:', err.message);
      return { success: false, error: 'api_error' };
    }
  }
}

export default new RecaptchaService();
