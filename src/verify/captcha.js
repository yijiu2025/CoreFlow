import sharp from 'sharp';
import svgCaptcha from 'svg-captcha';
import { v4 as uuidv4 } from 'uuid';

/**
 * 验证码核心逻辑
 */
class CaptchaService {
  /**
   * 生成新的验证码图片和唯一标识符
   * @param {object} captchaStore - 存储适配器
   * @returns {Promise<Object>}
   */
  async generate(captchaStore) {
    const captcha = svgCaptcha.create({
      size: 4,
      fontSize: 45,
      noise: Math.floor(Math.random() * 5),
      width: 80,
      height: 40,
      color: true,
      background: '#fff'
    });

    const { data, text } = captcha;
    const str = await sharp(Buffer.from(data)).png().toBuffer();
    const image = 'data:image/png;base64,' + str.toString('base64');

    const tag = uuidv4();
    const expired = Date.now() + 10 * 60 * 1000; // 10分钟

    const captchaData = {
      text: text.toLowerCase(),
      verified: false,
      expired
    };

    // 写入存储介质，设置 600 秒 (10 分钟) 过期
    await captchaStore.set(tag, captchaData, 600);

    return {
      captchaImage: image,
      captchaKey: tag,
      text: text.toLowerCase()
    };
  }

  /**
   * 验证图形验证码
   * @param {string} captcha 用户输入的验证码文本
   * @param {string} tag 验证码唯一标识符
   * @param {object} captchaStore - 存储适配器
   * @returns {Promise<boolean>}
   */
  async verify(captcha, tag, captchaStore) {
    if (!captcha || !tag) return false;

    const info = await captchaStore.get(tag);

    if (!info) return false;
    if (Date.now() > info.expired) {
      await captchaStore.delete(tag);
      return false;
    }

    if (info.text.toLowerCase() !== captcha.toLowerCase()) {
      return false;
    }

    // 标记为已验证
    info.verified = true;
    info.expired = Date.now() + 5 * 60 * 1000; // 验证通过后延长 5 分钟生命周期

    await captchaStore.set(tag, info, 300);

    return true;
  }

  /**
   * 校验并立即销毁（用于最终业务校验，防止重放）
   */
  async consume(tag, captchaStore) {
    if (!tag) return false;

    const info = await captchaStore.get(tag);
    if (!info || Date.now() > info.expired) return false;

    if (info.verified === true) {
      await captchaStore.delete(tag);
      return true;
    }

    return false;
  }
}

export default new CaptchaService();
