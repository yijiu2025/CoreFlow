/**
 * 邮箱验证码核心服务
 * 纯验证逻辑，不含存储
 */
import emailService from '../../notice/services/email.js';
import config from '../config.js';

class EmailService {
  constructor() {
    this.rateLimit = config.common.rateLimit;
    this.codeTtl = config.common.codeTtl;
  }

  /**
   * 生成验证码
   * @param {number} [length=6] 验证码长度
   * @returns {string} 数字验证码
   */
  generateCode(length = 6) {
    const min = Math.pow(10, length - 1);
    return Math.floor(min + Math.random() * 9 * min).toString();
  }

  /**
   * 发送验证码邮件
   * @param {string} email 邮箱地址
   * @param {string} code 验证码
   * @returns {Promise<boolean>}
   */
  async send(email, code) {
    return await emailService.sendVerificationCode(email, code);
  }
}

export default new EmailService();
