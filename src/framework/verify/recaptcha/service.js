/**
 * 人机验证核心服务
 * 对接 Google reCAPTCHA / hCaptcha / Cloudflare Turnstile API
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @updated 2026-08-29 加 Turnstile 支持
 */
import config from '../config.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.verify.recaptcha.service');

const recaptchaConfig = config.recaptcha;

/** 验证结果 */
const VERIFY_RESULT = {
  SUCCESS: 'success',
  FAIL: 'fail',
  ERROR: 'error'
};

class RecaptchaService {
  /**
   * 🔴 未配置时是否放行：生产必须 fail-closed（宁可拒绝也不静默绕过人机校验），
   * 非生产放行以便本地开发。
   */
  _missingKeyResult(logMsg) {
    log.warn(logMsg);
    if (process.env.NODE_ENV === 'production') {
      return { success: false, error: 'not_configured' };
    }
    return { success: true };
  }

  /**
   * 校验上游返回的 hostname / action（防 token 跨域名/跨用途挪用）
   * 仅当配置了期望值时才校验；配置了但上游缺失或不匹配 → fail-closed。
   * @private
   */
  _matchHostnameAndAction(data) {
    const { expectedHostname, expectedAction } = recaptchaConfig;
    if (expectedHostname) {
      if (!data.hostname || data.hostname !== expectedHostname) {
        return { success: false, error: 'hostname_mismatch' };
      }
    }
    if (expectedAction) {
      if (!data.action || data.action !== expectedAction) {
        return { success: false, error: 'action_mismatch' };
      }
    }
    return null;
  }

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
      case 'turnstile':
        return await this._verifyTurnstile(token, remoteIp);
      default:
        return this._missingKeyResult(`[Recaptcha] 未知服务商: ${provider}，拒绝验证`);
    }
  }

  /**
   * Google reCAPTCHA 验证
   * @private
   */
  async _verifyGoogle(token, remoteIp) {
    const secretKey = recaptchaConfig.secretKey;
    if (!secretKey) {
      return this._missingKeyResult('[Recaptcha] RECAPTCHA_SECRET_KEY 未配置');
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token
      });
      if (remoteIp) params.append('remoteip', remoteIp);

      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: params,
        // 🔴 必须限时：上游不可达时请求不能无限挂起（此前无超时）
        signal: AbortSignal.timeout(3000)
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

      const hostActionMismatch = this._matchHostnameAndAction(data);
      if (hostActionMismatch) return hostActionMismatch;

      return { success: true, score: data.score };
    } catch (err) {
      log.error('[Recaptcha] Google API 请求失败:', err);
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
      return this._missingKeyResult('[Recaptcha] RECAPTCHA_SECRET_KEY 未配置');
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token
      });
      if (remoteIp) params.append('remoteip', remoteIp);
      // sitekey 校验：防止 token 被挪用到其他 sitekey（同 secretKey 多站点场景）
      const siteKey = recaptchaConfig.siteKey;
      if (siteKey) params.append('sitekey', siteKey);

      const res = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(3000)
      });

      const data = await res.json();

      if (!data.success) {
        return {
          success: false,
          error: data['error-codes']?.join(', ') || 'verification_failed'
        };
      }

      const hostActionMismatch = this._matchHostnameAndAction(data);
      if (hostActionMismatch) return hostActionMismatch;

      return { success: true };
    } catch (err) {
      log.error('[Recaptcha] hCaptcha API 请求失败:', err);
      return { success: false, error: 'api_error' };
    }
  }

  /**
   * Cloudflare Turnstile 验证
   * @private
   * 文档：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
   */
  async _verifyTurnstile(token, remoteIp) {
    // 独立 secret key（不与 hcaptcha/google 混用）
    const secretKey = recaptchaConfig.turnstileSecretKey;
    if (!secretKey) {
      return this._missingKeyResult('[Turnstile] TURNSTILE_SECRET_KEY 未配置');
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token
      });
      if (remoteIp) params.append('remoteip', remoteIp);

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(3000)
      });

      const data = await res.json();

      if (!data.success) {
        return {
          success: false,
          error: data['error-codes']?.join(', ') || 'verification_failed'
        };
      }

      // Turnstile 返回 hostname（验证 token 是哪个域名发的，防止跨域 token 挪用）
      // 生产环境可选：校验 hostname 与配置域名一致
      const hostActionMismatch = this._matchHostnameAndAction(data);
      if (hostActionMismatch) return hostActionMismatch;

      return { success: true, hostname: data.hostname, action: data.action };
    } catch (err) {
      log.error('[Turnstile] Cloudflare API 请求失败:', err);
      return { success: false, error: 'api_error' };
    }
  }
}

const recaptchaService = new RecaptchaService();

export { VERIFY_RESULT };
export default recaptchaService;
