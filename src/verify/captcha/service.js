/**
 * 图形验证码核心服务
 * 纯验证逻辑，不含存储，通过 Store 适配器解耦
 */
import svgCaptcha from 'svg-captcha';
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';

const DEFAULTS = config.captcha;

/** 难度预设 */
const LEVELS = DEFAULTS.levels;

class CaptchaService {
  /**
   * 生成新的验证码图片和唯一标识符
   * @param {object} store 存储适配器（实现 get/set/delete）
   * @param {object} [options] 可选配置覆盖
   * @param {string} [options.level] 难度：easy/normal/high
   * @param {number} [options.size] 验证码字符数
   * @param {number} [options.noise] 干扰线数量
   * @param {number} [options.ttl] 有效期（秒）
   * @returns {Promise<{captchaImage: string, captchaKey: string}>}
   */
  async generate(store, options = {}) {
    const levelConfig = LEVELS[options.level] || LEVELS.normal;
    const cfg = { ...DEFAULTS, ...levelConfig, ...options };

    const captcha = svgCaptcha.create({
      size: cfg.size,
      fontSize: cfg.fontSize,
      noise: cfg.noise,
      width: cfg.width || 80,
      height: cfg.height || 40,
      color: true,
      background: '#fff'
    });

    const { data, text } = captcha;
    const image = 'data:image/svg+xml;base64,' + Buffer.from(data).toString('base64');

    const tag = uuidv4();
    const expired = Date.now() + cfg.ttl * 1000;

    await store.set(tag, {
      text: text.toLowerCase(),
      verified: false,
      expired
    }, cfg.ttl);

    return { captchaImage: image, captchaKey: tag };
  }

  /**
   * 验证图形验证码（不销毁，可重复验证）
   * @param {string} captcha 用户输入
   * @param {string} tag 验证码标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async verify(captcha, tag, store) {
    if (!captcha || !tag) return false;

    const info = await store.get(tag);
    if (!info) return false;

    if (Date.now() > info.expired) {
      await store.delete(tag);
      return false;
    }

    if (info.text.toLowerCase() !== captcha.toLowerCase()) {
      return false;
    }

    // 标记为已验证，延长生命周期
    info.verified = true;
    info.expired = Date.now() + DEFAULTS.extendTtl * 1000;
    await store.set(tag, info, DEFAULTS.extendTtl);

    return true;
  }

  /**
   * 消费验证码（一次性使用，防重放）
   * @param {string} tag 验证码标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async consume(tag, store) {
    if (!tag) return false;

    const info = await store.get(tag);
    if (!info || Date.now() > info.expired) return false;

    if (info.verified === true) {
      await store.delete(tag);
      return true;
    }

    return false;
  }
}

export default new CaptchaService();
