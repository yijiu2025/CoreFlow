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
   * 记一次失败尝试；达到上限即作废整个 captchaKey
   *
   * 为什么必须记：图码只有 4–6 位字符，TTL 默认 10 分钟。没有次数上限时，
   * 拿同一个 captchaKey 反复试错的总猜中概率远高于直觉（且路由层限频是按 IP 的，
   * 攻击者换 IP 就能继续打同一个 key —— 限频对此完全无效）。
   *
   * 写回时**按剩余 TTL** 计算，不能用完整 TTL：否则每失败一次就续命一次，
   * 失败越多有效期越长（与 verify/email/dao.js 的同类处理保持一致）。
   *
   * @param {string} tag captchaKey
   * @param {object} info 当前记录
   * @param {object} store 存储适配器
   * @param {number} now 当前毫秒时间
   * @returns {Promise<void>}
   */
  async _recordFailure(tag, info, store, now) {
    const maxAttempts = Number(DEFAULTS.maxAttempts) > 0 ? Number(DEFAULTS.maxAttempts) : 5;
    const attempts = (info.attempts || 0) + 1;

    if (attempts >= maxAttempts) {
      await store.delete(tag);
      return;
    }

    const remainingSec = Math.max(1, Math.ceil((info.expired - now) / 1000));
    await store.set(tag, { ...info, attempts }, remainingSec);
  }

  /**
   * 验证图形验证码（不销毁，可重复验证；失败次数有上限）
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

    const now = Date.now();
    if (now > info.expired) {
      await store.delete(tag);
      return false;
    }

    // 指纹校验：captchaKey 必须由同一客户端使用（防盗用绕过）
    if (info.fingerprint && ctx) {
      const currentFp = fingerprintFromCtx(ctx);
      if (info.fingerprint !== currentFp) {
        await this._recordFailure(tag, info, store, now);
        return false; // 指纹不符静默拒绝（不提示原因，防探测）
      }
    }

    if (info.text.toLowerCase() !== String(captcha).toLowerCase()) {
      await this._recordFailure(tag, info, store, now);
      return false;
    }

    // 标记为已验证，延长生命周期
    info.verified = true;
    info.expired = now + DEFAULTS.extendTtl * 1000;
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
      // 原子消费：并发只有一个能取到，防重放
      const consumed = await store.getDel(tag);
      return Boolean(consumed);
    }

    return false;
  }
}

const captchaService = new CaptchaService();

export default captchaService;
