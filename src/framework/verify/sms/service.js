/**
 * 短信验证码核心服务
 * 对接短信 API（阿里云/腾讯云），纯发送逻辑，不含存储
 */
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
        console.warn(`[SMS] 未知服务商: ${provider}，使用模拟发送`);
        console.log(`[SMS] 模拟发送: ${phone} -> ${code}`);
        return true;
    }
  }

  /**
   * 阿里云短信发送
   * @private
   */
  async _sendAliyun(phone, code) {
    // TODO: 对接阿里云短信 API
    // const Dysmsapi = require('@alicloud/dysmsapi20170525');
    console.log(`[SMS] 阿里云发送: ${phone} -> ${code}`);
    return true;
  }

  /**
   * 腾讯云短信发送
   * @private
   */
  async _sendTencent(phone, code) {
    // TODO: 对接腾讯云短信 API
    // const tencentcloud = require('tencentcloud-sdk-nodejs');
    console.log(`[SMS] 腾讯云发送: ${phone} -> ${code}`);
    return true;
  }

  /**
   * 生成验证码
   * @param {number} [length] 验证码长度
   * @returns {string}
   */
  generateCode(length) {
    const len = length || smsConfig.codeLength;
    const min = Math.pow(10, len - 1);
    return Math.floor(min + Math.random() * 9 * min).toString();
  }
}

export default new SmsService();
