/**
 * 图形验证码核心服务
 * 纯验证逻辑，不含存储，通过 Store 适配器解耦
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import svgCaptcha from 'svg-captcha';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import config from '../config.js';

const DEFAULTS = config.captcha;

/** 难度预设 */
const LEVELS = DEFAULTS.levels;

/**
 * 从客户端上下文计算指纹（IP+UA+deviceFp）
 * captchaKey 绑定此指纹：generate 时存，verify/consume 时校验一致，
 * 防 captchaKey 被他人盗用绕过（攻击者自己设备过验证，拿 tag 到别处用会被拒）
 */
function fingerprintFromCtx(ctx = {}) {
  const ip = ctx.ip || '';
  const ua = ctx.ua || '';
  const deviceFp = ctx.deviceFp || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}|${deviceFp}`).digest('hex').slice(0, 32);
}

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
  async generate(store, options = {}, ctx = {}) {
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

    // 绑定客户端指纹（IP+UA+deviceFp），防 captchaKey 被他人盗用绕过
    // （攻击者在自己设备过图形验证，拿 tag 到另一设备/账号登录或发码会被拒）
    const fingerprint = fingerprintFromCtx(ctx);

    await store.set(
      tag,
      {
        text: text.toLowerCase(),
        verified: false,
        expired,
        fingerprint
      },
      cfg.ttl
    );

    return { captchaImage: image, captchaKey: tag };
  }

  /**
   * 验证图形验证码（不销毁，可重复验证）
   * @param {string} captcha 用户输入
   * @param {string} tag 验证码标识
   * @param {object} store 存储适配器
   * @param {object} [ctx] 客户端上下文（含指纹），传入则校验指纹一致
   * @returns {Promise<boolean>}
   */
  async verify(captcha, tag, store, ctx = null) {
    if (!captcha || !tag) return false;

    const info = await store.get(tag);
    if (!info) return false;

    if (Date.now() > info.expired) {
      await store.delete(tag);
      return false;
    }

    // 指纹校验：captchaKey 必须由同一客户端使用（防盗用绕过）
    if (info.fingerprint && ctx) {
      const currentFp = fingerprintFromCtx(ctx);
      if (info.fingerprint !== currentFp) {
        return false; // 指纹不符静默拒绝（不提示原因，防探测）
      }
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
   * @param {object} [ctx] 客户端上下文（含指纹），传入则校验指纹一致
   * @returns {Promise<boolean>}
   */
  async consume(tag, store, ctx = null) {
    if (!tag) return false;

    const info = await store.get(tag);
    if (!info || Date.now() > info.expired) return false;

    // 指纹校验：consume 时必须与 generate 时同一客户端
    if (info.fingerprint && ctx) {
      const currentFp = fingerprintFromCtx(ctx);
      if (info.fingerprint !== currentFp) {
        return false; // 指纹不符静默拒绝
      }
    }

    if (info.verified === true) {
      await store.delete(tag);
      return true;
    }

    return false;
  }
}

export default new CaptchaService();
