/**
 * 图形验证码数据访问层
 * 协调 service 与存储层，处理频率限制等业务逻辑
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import captchaService from './service.js';

class CaptchaDao {
  /**
   * 生成图形验证码（绑客户端指纹，防 tag 被盗用绕过）
   * @param {object} store 存储适配器
   * @param {object} [options] 验证码配置
   * @param {object} [ctx] 客户端上下文 { ip, ua, deviceFp }，用于绑定指纹
   * @returns {Promise<{captchaImage: string, captchaKey: string}>}
   */
  async generate(store, options, ctx) {
    return await captchaService.generate(store, options, ctx);
  }

  /**
   * 验证图形验证码并可选发送邮箱验证码
   * @param {object} params { captchaKey, captchaValue, email }
   * @param {object} captchaStore 图形验证码存储
   * @param {object} emailCodeStore 邮箱验证码存储
   * @param {Function} sendEmailFn 发送邮箱验证码的函数
   * @param {object} [ctx] 客户端上下文（含指纹），校验与 generate 同一客户端
   * @returns {Promise<{message: string, emailSent: boolean}>}
   */
  async verifyAndSendEmail(params, captchaStore, emailCodeStore, sendEmailFn, ctx = null) {
    const { captchaKey, captchaValue, email } = params;

    const success = await captchaService.verify(captchaValue, captchaKey, captchaStore, ctx);
    if (!success) {
      throw new Error('VERIFY_FAILED:图形验证码错误或已过期');
    }

    if (email && sendEmailFn) {
      // 发邮箱码后立即消费图形码（一次性：1 图形码只允许发 1 次邮箱码）
      // 复用 captchaService.consume（校验 verified + 指纹 + 一次性删除）
      await sendEmailFn(email, captchaKey, emailCodeStore);
      await captchaService.consume(captchaKey, captchaStore, ctx);
      return { message: '验证成功，验证码已发送至邮箱', emailSent: true };
    }

    return { message: '图形验证成功', emailSent: false };
  }

  /**
   * 验证图形验证码（不发送邮件）
   * @param {string} captchaValue 用户输入
   * @param {string} captchaKey 验证码标识
   * @param {object} captchaStore 存储适配器
   * @param {object} [ctx] 客户端上下文（含指纹）
   * @returns {Promise<boolean>}
   */
  async verify(captchaValue, captchaKey, captchaStore, ctx = null) {
    return await captchaService.verify(captchaValue, captchaKey, captchaStore, ctx);
  }

  /**
   * 消费验证码（一次性使用）
   * @param {string} captchaKey 验证码标识
   * @param {object} captchaStore 存储适配器
   * @param {object} [ctx] 客户端上下文（含指纹），校验与 generate 同一客户端
   * @returns {Promise<boolean>}
   */
  async consume(captchaKey, captchaStore, ctx = null) {
    return await captchaService.consume(captchaKey, captchaStore, ctx);
  }
}

export default new CaptchaDao();
