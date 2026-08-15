/**
 * 二维码扫码数据访问层
 */
import qrcodeService from './service.js';

class QrCodeDao {
  async generate(store, options) {
    return await qrcodeService.generate(store, options);
  }

  async scan(sessionId, userId, store) {
    return await qrcodeService.scan(sessionId, userId, store);
  }

  async confirm(sessionId, userId, store) {
    return await qrcodeService.confirm(sessionId, userId, store);
  }

  async poll(sessionId, store) {
    return await qrcodeService.poll(sessionId, store);
  }

  async consume(sessionId, store) {
    return await qrcodeService.consume(sessionId, store);
  }
}

export default new QrCodeDao();
