/**
 * 人机验证数据访问层
 */
import recaptchaService from './service.js';

class RecaptchaDao {
  /**
   * 验证人机 token
   * @param {string} token reCAPTCHA/hCaptcha token
   * @param {string} [remoteIp] 客户端 IP
   * @returns {Promise<{success: boolean, score?: number, error?: string}>}
   */
  async verify(token, remoteIp) {
    return await recaptchaService.verify(token, remoteIp);
  }

  /**
   * 快速校验（仅返回是否通过）
   * @param {string} token reCAPTCHA/hCaptcha token
   * @param {string} [remoteIp] 客户端 IP
   * @returns {Promise<boolean>}
   */
  async isValid(token, remoteIp) {
    const result = await recaptchaService.verify(token, remoteIp);
    return result.success;
  }
}

export default new RecaptchaDao();
