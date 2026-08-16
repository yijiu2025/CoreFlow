/**
 * OAuth 2.1 设备授权端点（RFC 8628）
 *
 * POST /device_authorization — 发起设备授权
 * POST /device/token         — 设备端轮询获取令牌
 * GET  /device               — 用户验证页面（verification_uri 指向此）
 * POST /device/authorize     — 用户输入 user_code 并授权
 *
 * 注意：group 不设 prefix，路由直接落在 oauth21 system 前缀 /oauth2.1 下，
 * 与 oidc 发现文档声明的 device_authorization_endpoint 一致（避免双重前缀）。
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { DeviceService } from '../../../app/oauth21/services/device.service.js';

const deviceService = new DeviceService();

export default async function (fastify) {
  registerGroupMetadata({
    name: 'device',
    description: '设备授权流程（RFC 8628）',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /device_authorization — 发起设备授权
   *
   * 适用于输入受限设备（智能电视、CLI 工具等）。
   * 返回 device_code、user_code 和验证地址。
   */
  registerSecureRoute(fastify, {
    name: 'deviceCode',
    alias: '设备授权发起',
    method: 'POST',
    url: '/device_authorization',
    handler: async (request, reply) => {
      const { client_id, scope } = request.body;
      if (!client_id) {
        return reply.code(400).send({
          error: 'invalid_request',
          error_description: 'client_id is required'
        });
      }
      try {
        const result = await deviceService.initiateDeviceAuthorization(client_id, scope);
        return result;
      } catch (err) {
        if (err.message === 'invalid_client') {
          return reply.code(400).send({ error: 'invalid_client' });
        }
        throw err;
      }
    }
  });

  /**
   * POST /device/token — 设备端轮询获取令牌
   *
   * 设备端在用户完成授权前持续轮询此端点。
   * 返回 authorization_pending 表示等待中。
   */
  registerSecureRoute(fastify, {
    name: 'deviceToken',
    alias: '设备令牌轮询',
    method: 'POST',
    url: '/device/token',
    handler: async (request, reply) => {
      const { grant_type, device_code, client_id } = request.body;

      if (grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
        return reply.code(400).send({ error: 'unsupported_grant_type' });
      }
      if (!device_code || !client_id) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      const result = await deviceService.pollForToken(device_code, client_id);

      if (result.error === 'authorization_pending') {
        return reply.code(400).send(result);
      }
      if (result.error) {
        const status = result.error === 'slow_down' ? 429 : 400;
        return reply.code(status).send(result);
      }

      return result;
    }
  });

  /**
   * GET /device — 用户验证页面
   *
   * 用户在浏览器中打开此页面，输入 user_code 完成设备授权。
   */
  registerSecureRoute(fastify, {
    name: 'devicePage',
    alias: '设备验证页面',
    method: 'GET',
    url: '/device',
    handler: async (request, reply) => {
      const html = await deviceService.renderDevicePage(request.query.user_code);
      reply.type('text/html');
      return html;
    }
  });

  /**
   * POST /device/authorize — 用户输入 user_code 并授权
   */
  registerSecureRoute(fastify, {
    name: 'deviceAuthorize',
    alias: '设备授权确认',
    method: 'POST',
    url: '/device/authorize',
    requireLogin: true,
    handler: async (request, reply) => {
      const { user_code } = request.body;
      if (!user_code) {
        return reply.code(400).send({ success: false, error: 'user_code is required' });
      }
      // 必须已登录才能授权设备
      const user = request.state?.user;
      if (!user?.sub) {
        return reply.code(401).send({ success: false, error: 'unauthorized', error_description: '请先登录' });
      }
      const result = await deviceService.authorizeDevice(user_code, user.sub);
      return result;
    }
  });
}
