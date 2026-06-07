/**
 * 扫码登录模块
 *
 * GET  /qr/generate — 生成登录二维码
 * POST /qr/scan     — 移动端标记二维码为已扫码
 * POST /qr/confirm  — 移动端确认登录
 * GET  /qr/status   — 轮询二维码状态（PC 端调用）
 */

import { v4 as uuidv4 } from 'uuid';
import { registerSecureRoute } from '../../../guard.js';
import UserDao from '../../../../app/oauth21/dao/user.dao.js';
import { issueDirectTokens } from '../shared/token-issuer.js';
import { buildTokenResponse } from '../shared/cookies.js';

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
      const qrKey = uuidv4();
      const qrData = {
        status: 'PENDING',
        userId: null,
        expiredAt: Date.now() + 120_000
      };
      await qrStore.set(qrKey, qrData, 120);
      return { code: 200, message: 'ok', data: { qrKey, expires_in: 120 } };
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
      const data = await qrStore.get(qrKey);

      if (!data || data.status === 'CONFIRMED') {
        return reply.code(400).send({
          code: 400,
          message: '二维码不存在、已确认或已过期',
          data: null
        });
      }

      data.status = 'SCANNED';
      await qrStore.set(qrKey, data, 120);
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

      const data = await qrStore.get(qrKey);
      if (!data) {
        return reply.code(400).send({
          code: 400,
          message: '二维码无效或已过期',
          data: null
        });
      }

      data.status = 'CONFIRMED';
      data.userId = user.sub;
      await qrStore.set(qrKey, data, 120);
      return { code: 200, message: 'ok', data: { success: true } };
    }
  });

  // GET /qr/status — 轮询二维码状态（PC 端调用）
  registerSecureRoute(fastify, {
    name: 'qrStatus',
    alias: '检测二维码状态',
    method: 'GET',
    url: '/qr/status',
    handler: async (request, reply) => {
      const { qrKey, client_id, scope, nonce: oidcNonce } = request.query;
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
  });
}
