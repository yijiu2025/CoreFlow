/**
 * 短信验证码数据访问层
 * 处理频率限制、存储、校验逻辑
 */
import Logger from '../../log/index.js';
import smsService from './service.js';
import config from '../config.js';

const smsConfig = config.sms;

class SmsDao {
  /**
   * 发送短信验证码
   * @param {string} phone 手机号
   * @param {string} sessionId 会话标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async sendCode(phone, sessionId, store) {
    const code = smsService.generateCode();
    Logger.info(`[Verify] 发送短信验证码: ${phone}, 会话: ${sessionId}`);

    // 频率限制检查
    const current = await store.get(phone);
    if (current) {
      const diff = (Date.now() - current.sentAt) / 1000;
      if (diff < smsConfig.rateLimit) {
        throw new Error(
          `SEND_CODE_FAILED:发送过于频繁，请在 ${Math.ceil(smsConfig.rateLimit - diff)} 秒后再试`
        );
      }
    }

    // 存储验证码
    await store.set(
      phone,
      { code, sentAt: Date.now(), sessionId },
      smsConfig.ttl
    );

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

    const info = await store.get(phone);
    if (!info || info.code !== code) {
      throw new Error('VERIFY_FAILED:验证码错误或已过期');
    }

    // 一次性消费
    await store.delete(phone);
    return true;
  }
}

export default new SmsDao();
