/**
 * 语音验证码核心服务
 * 复用短信验证码的存储逻辑，调用语音播报 API
 */
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
        console.warn(`[Voice] 未知服务商: ${provider}，使用模拟发送`);
        console.log(`[Voice] 模拟语音播报: ${phone} -> ${code}`);
        return true;
    }
  }

  /**
   * 阿里云语音验证码
   * @private
   */
  async _sendAliyun(phone, code) {
    // TODO: 对接阿里云语音 API
    console.log(`[Voice] 阿里云语音: ${phone} -> ${code}`);
    return true;
  }

  /**
   * 腾讯云语音验证码
   * @private
   */
  async _sendTencent(phone, code) {
    // TODO: 对接腾讯云语音 API
    console.log(`[Voice] 腾讯云语音: ${phone} -> ${code}`);
    return true;
  }

  /**
   * 生成验证码（复用短信验证码长度配置）
   * @param {number} [length] 验证码长度
   * @returns {string}
   */
  generateCode(length) {
    const len = length || smsConfig.codeLength;
    const min = Math.pow(10, len - 1);
    return Math.floor(min + Math.random() * 9 * min).toString();
  }
}

export default new VoiceService();
