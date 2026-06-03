/**
 * 滑块验证码核心服务
 * 生成滑块拼图 + 验证滑块位置
 *
 * 工作原理：
 * 1. generate() 随机生成滑块目标坐标 (x, y)
 * 2. 前端根据坐标裁剪滑块图片，用户拖动滑块
 * 3. verify() 验证用户拖动的 X 坐标是否在容差范围内
 */
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import config from '../config.js';

const sliderConfig = config.slider;

class SliderService {
  /**
   * 生成滑块验证码 challenge
   * @param {object} store 存储适配器
   * @param {object} [options] 配置覆盖
   * @returns {Promise<{sliderKey: string, bgWidth: number, bgHeight: number, sliderWidth: number, sliderHeight: number, x: number, y: number}>}
   */
  async generate(store, options = {}) {
    const cfg = { ...sliderConfig, ...options };

    // 随机生成滑块位置（留出边距，防止滑块超出背景图）
    const bgWidth = 300;
    const bgHeight = 150;
    const sliderWidth = 40;
    const sliderHeight = 40;
    const x = Math.floor(Math.random() * (bgWidth - sliderWidth - 60)) + 30;
    const y = Math.floor(Math.random() * (bgHeight - sliderHeight - 20)) + 10;

    const sliderKey = uuidv4();
    const token = crypto.randomBytes(16).toString('hex');

    // 存储目标坐标和 token
    await store.set(sliderKey, {
      x,
      y,
      token,
      verified: false,
      attempts: 0,
      expired: Date.now() + cfg.ttl * 1000
    }, cfg.ttl);

    // 返回给前端的信息（不含真实坐标）
    return {
      sliderKey,
      bgWidth,
      bgHeight,
      sliderWidth,
      sliderHeight,
      token  // 前端用于加密坐标的 token
    };
  }

  /**
   * 验证滑块位置
   * @param {string} sliderKey 滑块标识
   * @param {number} userX 用户拖动的 X 坐标
   * @param {string} token 前端返回的 token
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async verify(sliderKey, userX, token, store) {
    if (!sliderKey || userX === undefined) return false;

    const data = await store.get(sliderKey);
    if (!data) return false;

    // 检查过期
    if (Date.now() > data.expired) {
      await store.delete(sliderKey);
      return false;
    }

    // 检查 token
    if (data.token !== token) return false;

    // 检查尝试次数（最多 5 次）
    data.attempts++;
    if (data.attempts > 5) {
      await store.delete(sliderKey);
      return false;
    }

    // 验证 X 坐标是否在容差范围内
    const tolerance = sliderConfig.tolerance;
    if (Math.abs(userX - data.x) <= tolerance) {
      data.verified = true;
      await store.set(sliderKey, data, 300);
      return true;
    }

    // 更新尝试次数
    await store.set(sliderKey, data);
    return false;
  }

  /**
   * 消费滑块验证码（一次性使用）
   * @param {string} sliderKey 滑块标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async consume(sliderKey, store) {
    if (!sliderKey) return false;

    const data = await store.get(sliderKey);
    if (!data || !data.verified) return false;

    await store.delete(sliderKey);
    return true;
  }
}

export default new SliderService();
