/**
 * 滑块验证码数据访问层
 * 协调 service 与存储层
 */
import sliderService from './service.js';

class SliderDao {
  /**
   * 生成滑块验证码
   * @param {object} store 存储适配器
   * @param {object} [options] 配置
   * @returns {Promise<object>}
   */
  async generate(store, options) {
    return await sliderService.generate(store, options);
  }

  /**
   * 验证滑块位置
   * @param {string} sliderKey 滑块标识
   * @param {number} userX 用户 X 坐标
   * @param {string} token token
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async verify(sliderKey, userX, token, store) {
    return await sliderService.verify(sliderKey, userX, token, store);
  }

  /**
   * 消费滑块验证码
   * @param {string} sliderKey 滑块标识
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async consume(sliderKey, store) {
    return await sliderService.consume(sliderKey, store);
  }
}

export default new SliderDao();
