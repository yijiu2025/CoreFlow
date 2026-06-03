/**
 * 二维码扫码验证核心服务
 * 生成二维码 + 轮询扫码状态 + 确认登录
 *
 * 工作流程：
 * 1. generate() 生成唯一 sessionId + 二维码图片
 * 2. 前端展示二维码，用户用手机扫码
 * 3. 手机端调用 confirm() 确认登录
 * 4. 前端轮询 poll() 获取扫码状态
 */
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';

const qrcodeConfig = config.qrcode;

/** 扫码状态 */
export const QR_STATUS = {
  PENDING: 'pending',     // 等待扫码
  SCANNED: 'scanned',     // 已扫码，待确认
  CONFIRMED: 'confirmed', // 已确认
  EXPIRED: 'expired'      // 已过期
};

class QrCodeService {
  /**
   * 生成二维码 challenge
   * @param {object} store 存储适配器
   * @param {object} [options] 配置
   * @returns {Promise<{sessionId: string, qrContent: string, expiresAt: number}>}
   */
  async generate(store, options = {}) {
    const cfg = { ...qrcodeConfig, ...options };
    const sessionId = uuidv4();
    const expiresAt = Date.now() + cfg.ttl * 1000;

    await store.set(sessionId, {
      status: QR_STATUS.PENDING,
      scannedBy: null,
      confirmedBy: null,
      createdAt: Date.now(),
      expiresAt
    }, cfg.ttl);

    // 二维码内容：包含 sessionId 的登录 URL
    const qrContent = `auth://login?sessionId=${sessionId}`;

    return { sessionId, qrContent, expiresAt };
  }

  /**
   * 手机端：标记已扫码（待确认）
   * @param {string} sessionId 会话标识
   * @param {string} userId 扫码用户 ID
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async scan(sessionId, userId, store) {
    const data = await store.get(sessionId);
    if (!data || data.status !== QR_STATUS.PENDING) return false;

    if (Date.now() > data.expiresAt) {
      await store.delete(sessionId);
      return false;
    }

    data.status = QR_STATUS.SCANNED;
    data.scannedBy = userId;
    await store.set(sessionId, data);
    return true;
  }

  /**
   * 手机端：确认登录
   * @param {string} sessionId 会话标识
   * @param {string} userId 确认用户 ID
   * @param {object} store 存储适配器
   * @returns {Promise<boolean>}
   */
  async confirm(sessionId, userId, store) {
    const data = await store.get(sessionId);
    if (!data) return false;

    if (data.status !== QR_STATUS.SCANNED && data.status !== QR_STATUS.PENDING) {
      return false;
    }

    if (Date.now() > data.expiresAt) {
      await store.delete(sessionId);
      return false;
    }

    data.status = QR_STATUS.CONFIRMED;
    data.confirmedBy = userId;
    await store.set(sessionId, data, 300); // 确认后保留 5 分钟
    return true;
  }

  /**
   * PC 端：轮询扫码状态
   * @param {string} sessionId 会话标识
   * @param {object} store 存储适配器
   * @returns {Promise<{status: string, userId: string|null}>}
   */
  async poll(sessionId, store) {
    const data = await store.get(sessionId);
    if (!data) return { status: QR_STATUS.EXPIRED, userId: null };

    if (Date.now() > data.expiresAt) {
      await store.delete(sessionId);
      return { status: QR_STATUS.EXPIRED, userId: null };
    }

    return {
      status: data.status,
      userId: data.confirmedBy || data.scannedBy || null
    };
  }

  /**
   * 消费二维码（确认后获取用户信息并销毁）
   * @param {string} sessionId 会话标识
   * @param {object} store 存储适配器
   * @returns {Promise<string|null>} 确认的用户 ID 或 null
   */
  async consume(sessionId, store) {
    const data = await store.get(sessionId);
    if (!data || data.status !== QR_STATUS.CONFIRMED) return null;

    await store.delete(sessionId);
    return data.confirmedBy;
  }
}

export default new QrCodeService();
