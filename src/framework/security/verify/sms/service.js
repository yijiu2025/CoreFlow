/**
 * 短信验证码核心服务
 * 对接短信 API（阿里云/腾讯云），纯发送逻辑，不含存储
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';
import config from '../config.js';

const smsConfig = config.sms;

/**
 * 短信服务商适配器
 * 根据配置选择不同的短信 API
 */
class SmsService {
  /**
   * 发送短信验证码
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
        throw new Error(`SEND_CODE_FAILED:不支持的短信服务商: ${provider}`);
    }
  }

  /**
   * 阿里云短信发送
   * @private
   */
  async _sendAliyun(_phone, _code) {
    // 未对接真实 API 时不得模拟成功：静默成功会让验证码流形同虚设
    throw new Error('SEND_CODE_FAILED:阿里云短信 API 尚未接入');
  }

  /**
   * 腾讯云短信发送
   * @private
   */
  async _sendTencent(_phone, _code) {
    throw new Error('SEND_CODE_FAILED:腾讯云短信 API 尚未接入');
  }

  /**
   * 生成验证码
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

const smsService = new SmsService();

export default smsService;
