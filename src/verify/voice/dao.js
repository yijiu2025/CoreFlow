/**
 * 语音验证码数据访问层
 * 复用短信验证码的存储和频率限制逻辑
 */
import Logger from '../../log/index.js';
import voiceService from './service.js';
import config from '../config.js';

const smsConfig = config.sms;

class VoiceDao {
  /**
   * 发送语音验证码
   * @param {string} phone 手机号
   * @param {string} sessionId 会话标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async sendCode(phone, sessionId, store) {
    const code = voiceService.generateCode();
    Logger.info(`[Verify] 发送语音验证码: ${phone}, 会话: ${sessionId}`);

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

    // 存储验证码（复用短信配置）
    await store.set(
      phone,
      { code, sentAt: Date.now(), sessionId, type: 'voice' },
      smsConfig.ttl
    );

    // 发送语音
    const sent = await voiceService.send(phone, code);
    if (!sent) {
      throw new Error('SEND_CODE_FAILED:语音发送失败，请联系管理员');
    }

    return true;
  }

  /**
   * 校验语音验证码（一次性消费）
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

export default new VoiceDao();
