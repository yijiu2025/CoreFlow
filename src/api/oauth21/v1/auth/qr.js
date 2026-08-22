/**
 * 扫码登录路由
 *
 * GET  /qr/generate — 生成登录二维码
 * POST /qr/scan     — 移动端标记二维码为已扫码
 * POST /qr/confirm  — 移动端确认登录
 * GET  /qr/status   — 轮询二维码状态（PC 端调用）
 *
 * 业务逻辑见 app/oauth21/services/qr.service.js。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerSecureRoute } from '../../../guard.js';
import { generateQrCode, scanQrCode, confirmQrCode, getQrStatus } from '../../../../app/oauth21/services/qr.service.js';

/**
 * 注册扫码登录路由
 */
export default function registerQrRoutes(fastify, qrStore) {
  // GET /qr/generate — 生成登录二维码
  // client_id/scope/oidcNonce 存入二维码，签发时用存储值（防 PC 端调包）
  registerSecureRoute(fastify, {
    name: 'qrGenerate',
    alias: '生成登录二维码',
    method: 'GET',
    url: '/qr/generate',
    handler: async request => {
      const { client_id, scope, nonce } = request.query;
      const { qrKey, expires_in, qrContent } = await generateQrCode(qrStore, {
        clientId: client_id,
        scope,
        oidcNonce: nonce
      });
      // 返回 qrContent：二维码内容（含 client_id），前端用 QRCode.toDataURL 生成图片
      return { code: 200, message: 'ok', data: { qrKey, expires_in, qrContent } };
    }
  });

  // POST /qr/scan — 移动端标记二维码为已扫码（记录移动端设备指纹）
  registerSecureRoute(fastify, {
    name: 'qrScan',
    alias: '扫描登录二维码',
    method: 'POST',
    url: '/qr/scan',
    handler: async (request, reply) => {
      const { qrKey } = request.body;
      const success = await scanQrCode(qrStore, qrKey, request);
      if (!success) {
        return reply.code(400).send({
          code: 400,
          message: '二维码不存在、已确认或已过期',
          data: null
        });
      }
      return { code: 200, message: 'ok', data: { success: true } };
    }
  });

  // POST /qr/confirm — 移动端确认登录（需已登录 + 校验 scan 时设备指纹一致）
  registerSecureRoute(fastify, {
    name: 'qrConfirm',
    alias: '确认扫码登录',
    method: 'POST',
    url: '/qr/confirm',
    requireLogin: true,
    handler: async (request, reply) => {
      const { qrKey } = request.body;
      const user = request.state?.user;

      if (!user?.sub) {
        return reply.code(401).send({
          code: 401,
          message: '移动端未登录',
          data: null
        });
      }

      const success = await confirmQrCode(qrStore, qrKey, user.sub, request);
      if (!success) {
        return reply.code(400).send({
          code: 400,
          message: '二维码无效、已过期或设备不一致',
          data: null
        });
      }
      return { code: 200, message: 'ok', data: { success: true } };
    }
  });

  // GET /qr/status — 轮询二维码状态（PC 端调用）
  // 仅传 qrKey：client_id/scope 从存储取（generateQR 时存），防 PC 端调包 client_id
  registerSecureRoute(fastify, {
    name: 'qrStatus',
    alias: '检测二维码状态',
    method: 'GET',
    url: '/qr/status',
    handler: (request, reply) => {
      const { qrKey } = request.query;
      return getQrStatus(qrStore, { qrKey }, request, reply, fastify);
    }
  });
}
