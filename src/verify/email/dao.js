/**
 * 邮箱验证码数据访问层
 * 处理频率限制、存储、校验逻辑
 */
import Logger from '../../log/index.js';
import emailService from './service.js';
import config from '../config.js';

class EmailDao {
  constructor() {
    this.rateLimit = config.common.rateLimit;
    this.codeTtl = config.common.codeTtl;
  }

  /**
   * 发送邮箱验证码
   * @param {string} email 邮箱地址
   * @param {string} sessionId 会话标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async sendCode(email, sessionId, store) {
    const code = emailService.generateCode();
    Logger.info(`[Verify] 发送验证码: ${email}, 会话: ${sessionId}`);

    // 频率限制检查
    const current = await store.get(email);
    if (current) {
      const diff = (Date.now() - current.sentAt) / 1000;
      if (diff < this.rateLimit) {
        throw new Error(
          `SEND_CODE_FAILED:发送过于频繁，请在 ${Math.ceil(this.rateLimit - diff)} 秒后再试`
        );
      }
    }

    // 存储验证码
    await store.set(
      email,
      { code, sentAt: Date.now(), sessionId },
      this.codeTtl
    );

    // 发送邮件
    const mailSent = await emailService.send(email, code);
    if (!mailSent) {
      throw new Error('SEND_CODE_FAILED:邮件发送服务异常，请联系管理员');
    }

    return true;
  }

  /**
   * 校验邮箱验证码（一次性消费）
   * @param {string} email 邮箱地址
   * @param {string} code 验证码
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async verifyCode(email, code, store) {
    if (!email || !code) {
      throw new Error('PARAM_ERROR:邮箱和验证码不能为空');
    }

    const info = await store.get(email);
    if (!info || info.code !== code) {
      throw new Error('VERIFY_FAILED:邮箱验证码错误或已过期');
    }

    // 一次性消费
    await store.delete(email);
    return true;
  }
}

export default new EmailDao();
