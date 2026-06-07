/**
 * 设备授权服务（RFC 8628）
 *
 * 使用项目统一的 getSessionStore 持久化数据，
 * Redis 可用时自动使用 Redis，否则降级为内存 Map。
 */

import { generateDeviceCode, generateUserCode } from '../crypto/tokens.js';
import { issueAccessToken } from '../crypto/jwt.js';
import TokenDao from '../dao/token.dao.js';
import ClientDao from '../dao/client.dao.js';
import { generateToken } from '../crypto/tokens.js';
import config from '../config/config.js';
import { getSessionStore } from '../../../redis/session-store.js';

const EXPIRES_IN = config.device.expiresIn; // 秒

export class DeviceService {
  constructor(fastify) {
    this.deviceStore = getSessionStore(fastify, 'device');
    this.userCodeStore = getSessionStore(fastify, 'device_uc');
  }

  /**
   * 发起设备授权
   */
  async initiateDeviceAuthorization(clientId, scope) {
    const client = await ClientDao.findById(clientId);
    if (!client) throw new Error('invalid_client');

    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();

    const entry = {
      device_code: deviceCode,
      user_code: userCode,
      client_id: clientId,
      scope: scope || client.scope,
      status: 'pending',
      sub: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + EXPIRES_IN * 1000,
      interval: config.device.interval
    };

    await this.deviceStore.set(deviceCode, entry, EXPIRES_IN);
    await this.userCodeStore.set(userCode.toUpperCase(), { deviceCode }, EXPIRES_IN);

    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${config.server.issuer}/device`,
      verification_uri_complete: `${config.server.issuer}/device?user_code=${userCode}`,
      expires_in: EXPIRES_IN,
      interval: config.device.interval
    };
  }

  /**
   * 用户输入 user_code 并授权
   */
  async authorizeDevice(userCode, userId) {
    const ref = await this.userCodeStore.get(userCode.toUpperCase());
    if (!ref) return { success: false, error: 'invalid_user_code' };

    const entry = await this.deviceStore.get(ref.deviceCode);
    if (!entry) return { success: false, error: 'invalid_user_code' };
    if (entry.status !== 'pending')
      return { success: false, error: 'already_processed' };
    if (Date.now() > entry.expiresAt)
      return { success: false, error: 'expired' };

    entry.status = 'authorized';
    entry.sub = userId;
    entry.authorizedAt = Date.now();

    await this.deviceStore.set(ref.deviceCode, entry, EXPIRES_IN);
    return { success: true };
  }

  /**
   * 设备端轮询获取令牌
   */
  async pollForToken(deviceCode, clientId) {
    const entry = await this.deviceStore.get(deviceCode);
    if (!entry) {
      return {
        error: 'invalid_grant',
        error_description: 'Invalid device code'
      };
    }
    if (entry.client_id !== clientId) {
      return { error: 'invalid_grant', error_description: 'Client mismatch' };
    }
    if (Date.now() > entry.expiresAt) {
      await this.deviceStore.delete(deviceCode);
      await this.userCodeStore.delete(entry.user_code.toUpperCase());
      return {
        error: 'expired_token',
        error_description: 'Device code expired'
      };
    }

    if (entry.status === 'pending') {
      return {
        error: 'authorization_pending',
        error_description: 'User has not yet authorized'
      };
    }

    if (entry.status === 'denied') {
      return {
        error: 'access_denied',
        error_description: 'User denied the request'
      };
    }

    if (entry.status === 'authorized') {
      const accessToken = issueAccessToken({
        sub: entry.sub,
        client_id: entry.client_id,
        scope: entry.scope
      });

      const refreshToken = generateToken(48);
      await TokenDao.save(refreshToken, {
        sub: entry.sub,
        client_id: entry.client_id,
        scope: entry.scope,
        expiresIn: config.jwt.refreshTokenTTL
      });

      // 清理
      await this.deviceStore.delete(deviceCode);
      await this.userCodeStore.delete(entry.user_code.toUpperCase());

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: config.jwt.accessTokenTTL,
        refresh_token: refreshToken,
        scope: entry.scope
      };
    }

    return { error: 'server_error', error_description: 'Unknown status' };
  }
}
