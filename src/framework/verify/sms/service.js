/**
 * 短信验证码核心服务
 * 对接短信 API（阿里云/腾讯云），纯发送逻辑，不含存储
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import crypto from 'node:crypto';
import config from '../config.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.verify.sms.service');

const smsConfig = config.sms;

/**
 * 手机号脱敏：138****1234
 * 🔴 严禁在日志中输出完整手机号与验证码——有日志权限者可直接绕过验证。
 * @param {string} phone 完整手机号
 * @returns {string} 掩码后的手机号
 */
function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length <= 7) return `${p.slice(0, 1)}****`;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

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
        log.warn(`[SMS] 未知服务商: ${provider}，使用模拟发送`);
        log.info(`[SMS] 模拟发送: ${maskPhone(phone)}`);
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
    log.info(`[SMS] 阿里云发送: ${maskPhone(phone)}`);
    return true;
  }

  /**
   * 腾讯云短信发送
   * @private
   */
  async _sendTencent(phone, code) {
    // TODO: 对接腾讯云短信 API
    // const tencentcloud = require('tencentcloud-sdk-nodejs');
    log.info(`[SMS] 腾讯云发送: ${maskPhone(phone)}`);
    return true;
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
