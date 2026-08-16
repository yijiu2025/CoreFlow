/**
 * 扫码登录路由
 *
 * GET  /qr/generate — 生成登录二维码
 * POST /qr/scan     — 移动端标记二维码为已扫码
 * POST /qr/confirm  — 移动端确认登录
 * GET  /qr/status   — 轮询二维码状态（PC 端调用）
 *
 * 业务逻辑见 app/oauth21/services/qr.service.js。
 */
import { registerSecureRoute } from '../../../guard.js';
import { generateQrCode, scanQrCode, confirmQrCode, getQrStatus } from '../../../../app/oauth21/services/qr.service.js';

/**
 * 注册扫码登录路由
 */
export default function registerQrRoutes(fastify, qrStore) {
  // GET /qr/generate — 生成登录二维码
  registerSecureRoute(fastify, {
    name: 'qrGenerate',
    alias: '生成登录二维码',
    method: 'GET',
    url: '/qr/generate',
    handler: async () => {
      const { qrKey, expires_in } = await generateQrCode(qrStore);
      return { code: 200, message: 'ok', data: { qrKey, expires_in } };
    }
  });

  // POST /qr/scan — 移动端标记二维码为已扫码
  registerSecureRoute(fastify, {
    name: 'qrScan',
    alias: '扫描登录二维码',
    method: 'POST',
    url: '/qr/scan',
    handler: async (request, reply) => {
      const { qrKey } = request.body;
      const success = await scanQrCode(qrStore, qrKey);
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

  // POST /qr/confirm — 移动端确认登录
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

      const success = await confirmQrCode(qrStore, qrKey, user.sub);
      if (!success) {
        return reply.code(400).send({
          code: 400,
          message: '二维码无效或已过期',
          data: null
        });
      }
      return { code: 200, message: 'ok', data: { success: true } };
    }
  });

  // GET /qr/status — 轮询二维码状态（PC 端调用）
  registerSecureRoute(fastify, {
    name: 'qrStatus',
    alias: '检测二维码状态',
    method: 'GET',
    url: '/qr/status',
    handler: (request, reply) => {
      const { qrKey, client_id, scope, nonce: oidcNonce } = request.query;
      return getQrStatus(qrStore, { qrKey, client_id, scope, oidcNonce }, request, reply, fastify);
    }
  });
}
