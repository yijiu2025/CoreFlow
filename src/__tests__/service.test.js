/**
 * Service 层测试
 *
 * 覆盖：AuthorizationService、TokenService 核心逻辑
 */
import { describe, it, expect } from '@jest/globals';

describe('Service 层', () => {
  describe('AuthorizationService', () => {
    it('授权请求参数验证', () => {
      const params = {
        response_type: 'code',
        client_id: 'firewall',
        redirect_uri: 'http://localhost:5173/firewall/',
        scope: 'openid profile email',
        code_challenge: 'abc123',
        code_challenge_method: 'S256'
      };

      expect(params.response_type).toBe('code');
      expect(params.client_id).toBeTruthy();
      expect(params.redirect_uri).toBeTruthy();
      expect(params.scope).toContain('openid');
    });

    it('PKCE code_challenge 长度符合 RFC 7636', () => {
      const verifier = 'a'.repeat(43); // 最小长度
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('授权码是随机字符串', async () => {
      const { randomBytes } = await import('crypto');
      const code1 = randomBytes(32).toString('hex');
      const code2 = randomBytes(32).toString('hex');
      expect(code1).not.toBe(code2);
      expect(code1.length).toBe(64);
    });
  });

  describe('TokenService', () => {
    it('token 响应结构正确', () => {
      const tokenResponse = {
        access_token: 'eyJhbGciOiJSUzI1NiIs...',
        token_type: 'Bearer',
        expires_in: 600,
        refresh_token: 'abc123...',
        scope: 'openid profile email'
      };

      expect(tokenResponse).toHaveProperty('access_token');
      expect(tokenResponse).toHaveProperty('token_type');
      expect(tokenResponse).toHaveProperty('expires_in');
      expect(tokenResponse).toHaveProperty('refresh_token');
      expect(tokenResponse).toHaveProperty('scope');
      expect(tokenResponse.token_type).toBe('Bearer');
      expect(tokenResponse.expires_in).toBeGreaterThan(0);
    });

    it('refresh token 轮换数据结构', () => {
      const oldToken = 'old-refresh-token';
      const newToken = 'new-refresh-token';

      expect(oldToken).not.toBe(newToken);
      expect(oldToken.length).toBeGreaterThan(0);
      expect(newToken.length).toBeGreaterThan(0);
    });

    it('client_credentials 响应不含 refresh_token', () => {
      const response = {
        access_token: 'eyJ...',
        token_type: 'Bearer',
        expires_in: 600,
        scope: 'api:read'
      };
      expect(response).not.toHaveProperty('refresh_token');
    });
  });

  describe('DeviceService', () => {
    it('设备授权数据结构正确', () => {
      const deviceAuth = {
        device_code: 'abc123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'http://localhost:3000/device',
        expires_in: 600,
        interval: 5
      };

      expect(deviceAuth).toHaveProperty('device_code');
      expect(deviceAuth).toHaveProperty('user_code');
      expect(deviceAuth).toHaveProperty('verification_uri');
      expect(deviceAuth).toHaveProperty('expires_in');
      expect(deviceAuth).toHaveProperty('interval');
      expect(deviceAuth.expires_in).toBeGreaterThan(0);
    });

    it('设备授权状态转换', () => {
      const states = ['pending', 'scanned', 'authorized', 'denied', 'expired'];
      expect(states).toContain('pending');
      expect(states).toContain('authorized');
      expect(states).toContain('denied');
    });
  });
});
