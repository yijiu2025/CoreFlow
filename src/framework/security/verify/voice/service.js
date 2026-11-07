/**
 * 语音验证码核心服务
 * 复用短信验证码的存储逻辑，调用语音播报 API
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';
import config from '../config.js';

const smsConfig = config.sms;

class VoiceService {
  /**
   * 发送语音验证码
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @returns {Promise<boolean>}
   */
  async send(phone, code) {
    const provider = smsConfig.provider;

    switch (provider) {
      case 'aliyun':
        return await this._sendAliyun(phone, code);
      case 'tencent':
        return await this._sendTencent(phone, code);
      default:
        throw new Error(`SEND_CODE_FAILED:不支持的语音服务商: ${provider}`);
    }
  }

  /**
   * 阿里云语音验证码
   * @private
   */
  async _sendAliyun(_phone, _code) {
    throw new Error('SEND_CODE_FAILED:阿里云语音 API 尚未接入');
  }

  /**
   * 腾讯云语音验证码
   * @private
   */
  async _sendTencent(_phone, _code) {
    throw new Error('SEND_CODE_FAILED:腾讯云语音 API 尚未接入');
  }

  /**
   * 生成验证码（复用短信验证码长度配置）
   * 🔴 必须用密码学安全随机（crypto.randomInt）——Math.random 可预测。
   * @param {number} [length] 验证码长度
   * @returns {string}
   */
  generateCode(length) {
    const len = length || smsConfig.codeLength;
    const min = Math.pow(10, len - 1);
    return crypto.randomInt(min, Math.pow(10, len)).toString();
  }
}

const voiceService = new VoiceService();

export default voiceService;
