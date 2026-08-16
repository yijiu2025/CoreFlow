/**
 * 扫码登录业务服务
 *
 * 从 api/oauth21/v1/auth/qr.js 下沉：二维码状态机 + 确认后签发令牌。
 * 状态流转：PENDING → SCANNED → CONFIRMED（→ 签发令牌）/ EXPIRED。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { v4 as uuidv4 } from 'uuid';
import UserDao from '../dao/user.dao.js';
import { issueDirectTokens } from './token-issuer.service.js';
import { buildTokenResponse } from './cookies.service.js';

/** 二维码有效期（秒） */
const QR_TTL = 120;

/**
 * 生成登录二维码
 * @returns {Promise<{qrKey: string, expires_in: number}>}
 */
export async function generateQrCode(qrStore) {
  const qrKey = uuidv4();
  await qrStore.set(
    qrKey,
    {
      status: 'PENDING',
      userId: null,
      expiredAt: Date.now() + QR_TTL * 1000
    },
    QR_TTL
  );
  return { qrKey, expires_in: QR_TTL };
}

/**
 * 移动端标记二维码为已扫码
 * @returns {Promise<object|false>} 成功返回 true，二维码无效返回 false
 */
export async function scanQrCode(qrStore, qrKey) {
  const data = await qrStore.get(qrKey);

  if (!data || data.status === 'CONFIRMED') {
    return false;
  }

  data.status = 'SCANNED';
  await qrStore.set(qrKey, data, QR_TTL);
  return true;
}

/**
 * 移动端确认登录（需已登录用户上下文）
 *
 * @param {object} qrStore
 * @param {string} qrKey
 * @param {string} userId - 当前登录用户 sub
 * @returns {Promise<boolean>} 成功返回 true，二维码无效返回 false
 */
export async function confirmQrCode(qrStore, qrKey, userId) {
  const data = await qrStore.get(qrKey);
  if (!data) {
    return false;
  }

  data.status = 'CONFIRMED';
  data.userId = userId;
  await qrStore.set(qrKey, data, QR_TTL);
  return true;
}

/**
 * 轮询二维码状态；CONFIRMED 时签发令牌
 *
 * @param {object} qrStore
 * @param {object} params - { qrKey, client_id, scope, oidcNonce }
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @param {object} fastify - Fastify 实例
 * @returns {Promise<object>} 状态响应或令牌响应
 */
export async function getQrStatus(qrStore, { qrKey, client_id, scope, oidcNonce }, request, reply, fastify) {
  const data = await qrStore.get(qrKey);

  if (!data) {
    return { code: 200, message: 'ok', data: { status: 'EXPIRED' } };
  }

  if (data.status === 'CONFIRMED') {
    const user = await UserDao.findById(data.userId);
    if (!user) {
      return { code: 404, message: '用户不存在', data: { status: 'ERROR' } };
    }

    try {
      const result = await issueDirectTokens(user, client_id, scope, oidcNonce, request, reply, fastify);
      await qrStore.delete(qrKey);
      return buildTokenResponse(result, '扫码登录成功');
    } catch (err) {
      if (err.message === 'invalid_client') {
        return { code: 401, message: '客户端认证失败', data: { status: 'ERROR' } };
      }
      throw err;
    }
  }

  return { code: 200, message: 'ok', data: { status: data.status } };
}
