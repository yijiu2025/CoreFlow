/**
 * 短信验证码数据访问层
 * 处理频率限制、存储、校验逻辑
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import Logger from '../../log/index.js';
import smsService from './service.js';
import config from '../config.js';

const smsConfig = config.sms;

class SmsDao {
  /**
   * 手机号脱敏：138****1234
   * @param {string} phone 完整手机号
   * @returns {string} 掩码后的手机号
   */
  maskPhone(phone) {
    const p = String(phone || '');
    if (p.length <= 7) return `${p.slice(0, 1)}****`;
    return `${p.slice(0, 3)}****${p.slice(-4)}`;
  }

  /**
   * 发送短信验证码
   * @param {string} phone 手机号
   * @param {string} sessionId 会话标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async sendCode(phone, sessionId, store) {
    const code = smsService.generateCode();
    // 🔴 PII 脱敏：不落完整手机号
    Logger.info(`[Verify] 发送短信验证码: ${this.maskPhone(phone)}`);

    // 频率限制检查
    const current = await store.get(phone);
    if (current) {
      const diff = (Date.now() - current.sentAt) / 1000;
      if (diff < smsConfig.rateLimit) {
        throw new Error(`SEND_CODE_FAILED:发送过于频繁，请在 ${Math.ceil(smsConfig.rateLimit - diff)} 秒后再试`);
      }
    }

    // 存储验证码
    await store.set(phone, { code, sentAt: Date.now(), sessionId }, smsConfig.ttl);

    // 发送短信
    const sent = await smsService.send(phone, code);
    if (!sent) {
      throw new Error('SEND_CODE_FAILED:短信发送失败，请联系管理员');
    }

    return true;
  }

  /**
   * 校验短信验证码（一次性消费）
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async verifyCode(phone, code, store) {
    if (!phone || !code) {
      throw new Error('PARAM_ERROR:手机号和验证码不能为空');
    }

    // 🔴 爆破防护：失败尝试次数上限 5 次，达到即作废验证码（此前 6 位码在 TTL 内可无限重试）
    const MAX_ATTEMPTS = 5;
    const info = await store.get(phone);
    if (!info) {
      throw new Error('VERIFY_FAILED:验证码错误或已过期');
    }

    const attempts = (info.attempts || 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      await store.delete(phone);
      throw new Error('VERIFY_FAILED:尝试次数过多，请重新获取验证码');
    }

    if (info.code !== code) {
      const remainingSec = Math.max(1, Math.ceil(smsConfig.ttl - (Date.now() - info.sentAt) / 1000));
      await store.set(phone, { ...info, attempts }, remainingSec);
      throw new Error('VERIFY_FAILED:验证码错误或已过期');
    }

    // 一次性消费
    await store.delete(phone);
    return true;
  }
}

const smsDao = new SmsDao();

export default smsDao;
