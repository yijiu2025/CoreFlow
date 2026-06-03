/**
 * 图形验证码数据访问层
 * 协调 service 与存储层，处理频率限制等业务逻辑
 */
import captchaService from './service.js';
import config from '../config.js';

class CaptchaDao {
  /**
   * 生成图形验证码
   * @param {object} store 存储适配器
   * @param {object} [options] 验证码配置
   * @returns {Promise<{captchaImage: string, captchaKey: string}>}
   */
  async generate(store, options) {
    return await captchaService.generate(store, options);
  }

  /**
   * 验证图形验证码并可选发送邮箱验证码
   * @param {object} params { captchaKey, captchaValue, email }
   * @param {object} captchaStore 图形验证码存储
   * @param {object} emailCodeStore 邮箱验证码存储
   * @param {Function} sendEmailFn 发送邮箱验证码的函数
   * @returns {Promise<{message: string, emailSent: boolean}>}
   */
  async verifyAndSendEmail(params, captchaStore, emailCodeStore, sendEmailFn) {
    const { captchaKey, captchaValue, email } = params;

    const success = await captchaService.verify(captchaValue, captchaKey, captchaStore);
    if (!success) {
      throw new Error('VERIFY_FAILED:图形验证码错误或已过期');
    }

    if (email && sendEmailFn) {
      await sendEmailFn(email, captchaKey, emailCodeStore);
      return { message: '验证成功，验证码已发送至邮箱', emailSent: true };
    }

    return { message: '图形验证成功', emailSent: false };
  }

  /**
   * 验证图形验证码（不发送邮件）
   * @param {string} captchaValue 用户输入
   * @param {string} captchaKey 验证码标识
   * @param {object} captchaStore 存储适配器
   * @returns {Promise<boolean>}
   */
  async verify(captchaValue, captchaKey, captchaStore) {
    return await captchaService.verify(captchaValue, captchaKey, captchaStore);
  }

  /**
   * 消费验证码（一次性使用）
   * @param {string} captchaKey 验证码标识
   * @param {object} captchaStore 存储适配器
   * @returns {Promise<boolean>}
   */
  async consume(captchaKey, captchaStore) {
    return await captchaService.consume(captchaKey, captchaStore);
  }
}

export default new CaptchaDao();
