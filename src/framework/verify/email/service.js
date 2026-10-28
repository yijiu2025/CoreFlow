/**
 * 邮箱验证码核心服务
 * 纯验证逻辑，不含存储
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';
import emailService from '../../notice/services/email.js';
import config from '../config.js';

class EmailService {
  constructor() {
    this.rateLimit = config.common.rateLimit;
    this.codeTtl = config.common.codeTtl;
  }

  /**
   * 生成验证码
   * 🔴 必须用密码学安全随机（crypto.randomInt）——Math.random 可预测，攻击者能据此推算他人验证码。
   * @param {number} [length=6] 验证码长度
   * @returns {string} 数字验证码
   */
  generateCode(length = 6) {
    const min = Math.pow(10, length - 1);
    // randomInt(min, max) 是 [min, max) 半开区间：max 取 10^length 才能覆盖到 999…9
    return crypto.randomInt(min, Math.pow(10, length)).toString();
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

const emailServiceInstance = new EmailService();

export default emailServiceInstance;
