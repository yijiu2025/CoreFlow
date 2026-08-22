/**
 * 扫码登录业务服务
 *
 * 从 api/oauth21/v1/auth/qr.js 下沉：二维码状态机 + 确认后签发令牌。
 * 状态流转：PENDING → SCANNED → CONFIRMED（→ 签发令牌）/ EXPIRED。
 *
 * 安全设计：
 * - 二维码内容 = 扫码 URL（含 qrKey + client_id），移动端扫到能识别给哪个应用
 * - generateQrCode 存 client_id/scope/oidcNonce，签发时用存储值（防 PC 端调包 client_id）
 * - scan 记录移动端设备指纹（IP+UA），confirm 校验同一移动端（防 scan 和 confirm 不同设备）
 * - confirm 需移动端已登录（requireLogin），记录 userId
 * - qrKey 一次性 + 120s TTL，签发后即删
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import UserDao from '../dao/user.dao.js';
import { issueDirectTokens } from './token-issuer.service.js';
import { buildTokenResponse } from './cookies.service.js';

/** 二维码有效期（秒） */
const QR_TTL = 120;

/**
 * 计算设备指纹（IP + UA hash，前 32 hex）
 * scan 时记录移动端指纹，confirm 时校验同一移动端
 */
function deviceFingerprint(request) {
  const ip = request?.ip || '';
  const ua = request?.headers?.['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 32);
}

/**
 * 生成登录二维码
 * @param {object} qrStore
 * @param {object} [ctx] - { clientId, scope, oidcNonce } PC 端发起的应用上下文，存入二维码供签发时用
 * @returns {Promise<{qrKey: string, expires_in: number, qrContent: string}>}
 *   qrContent 是二维码内容（扫码 URL），移动端扫描后解析
 */
export async function generateQrCode(qrStore, ctx = {}) {
  const qrKey = uuidv4();
  const { clientId = '', scope = '', oidcNonce = '' } = ctx;
  await qrStore.set(
    qrKey,
    {
      status: 'PENDING',
      userId: null,
      clientId, // 应用标识，签发时用（防 PC 端调包）
      scope,
      oidcNonce,
      deviceFingerprint: null, // scan 时填入移动端指纹
      expiredAt: Date.now() + QR_TTL * 1000
    },
    QR_TTL
  );

  // 二维码内容 = 扫码 URL（含 client_id），移动端扫到能识别给哪个应用登录
  // 注意：qrKey 是一次性凭证，放 URL query 里安全（需 120s 内 + 移动端 confirm 才生效）
  const qrContent = JSON.stringify({ qrKey, clientId, scope });
  return { qrKey, expires_in: QR_TTL, qrContent };
}

/**
 * 移动端标记二维码为已扫码
 * 记录移动端设备指纹，confirm 时校验同一设备（防 scan 和 confirm 不同移动端）
 * @returns {Promise<boolean>} 成功返回 true，二维码无效返回 false
 */
export async function scanQrCode(qrStore, qrKey, request) {
  const data = await qrStore.get(qrKey);

  if (!data || data.status === 'CONFIRMED') {
    return false;
  }

  data.status = 'SCANNED';
  // 记录移动端设备指纹（scan 的设备必须与 confirm 的设备一致）
  data.deviceFingerprint = deviceFingerprint(request);
  await qrStore.set(qrKey, data, QR_TTL);
  return true;
}

/**
 * 移动端确认登录（需已登录用户上下文）
 *
 * 安全：
 * 1. 校验 scan 和 confirm 是同一移动端（deviceFingerprint 一致）
 * 2. 移动端已登录（requireLogin 保证 user.sub 有值）
 *
 * @param {object} qrStore
 * @param {string} qrKey
 * @param {string} userId - 当前登录用户 sub
 * @param {object} request - Fastify request（校验设备指纹）
 * @returns {Promise<boolean>} 成功返回 true，二维码无效/设备不符返回 false
 */
export async function confirmQrCode(qrStore, qrKey, userId, request) {
  const data = await qrStore.get(qrKey);
  if (!data) {
    return false;
  }

  // 设备一致性校验：scan 时的移动端指纹必须与 confirm 时一致
  // 防 scan 和 confirm 来自不同设备（如 scan 被截获后另一设备 confirm）
  if (data.deviceFingerprint && data.deviceFingerprint !== deviceFingerprint(request)) {
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
 * 签发时用 generateQrCode 存储的 client_id（不是前端传的），防 PC 端调包 client_id
 *
 * @param {object} qrStore
 * @param {object} params - { qrKey }（client_id/scope 从存储取，不信任前端）
 * @param {object} request - Fastify request
 * @param {object} reply - Fastify reply
 * @param {object} fastify - Fastify 实例
 * @returns {Promise<object>} 状态响应或令牌响应
 */
export async function getQrStatus(qrStore, { qrKey }, request, reply, fastify) {
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
      // 用存储的 client_id/scope 签发（防 PC 端轮询时调包 client_id 给恶意应用）
      const result = await issueDirectTokens(
        user,
        data.clientId,
        data.scope,
        data.oidcNonce,
        request,
        reply,
        fastify
      );
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
