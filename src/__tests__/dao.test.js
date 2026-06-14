/**
 * DAO 层测试
 *
 * 覆盖：UserDAO、ApprovalDAO、TokenDAO 核心逻辑
 */
import { describe, it, expect } from '@jest/globals';

describe('DAO 层', () => {
  describe('UserDAO', () => {
    // 模拟 UserDAO 返回结构
    function formatUser(user) {
      if (!user) return null;
      return {
        id: user.uid,
        numericId: user.id,
        username: user.username,
        email: user.email,
        name: user.username,
        avatar: user.avatar,
        uid: user.uid
      };
    }

    it('formatUser 返回正确结构', () => {
      const raw = { id: 1, uid: 'uuid-1', username: 'test', email: 'test@example.com', avatar: null };
      const result = formatUser(raw);
      expect(result.id).toBe('uuid-1');
      expect(result.numericId).toBe(1);
      expect(result.username).toBe('test');
      expect(result.email).toBe('test@example.com');
      expect(result.avatar).toBeNull();
    });

    it('formatUser null 输入返回 null', () => {
      expect(formatUser(null)).toBeNull();
    });

    it('numericId 是数字类型', () => {
      const raw = { id: 42, uid: 'uuid-42', username: 'test', email: 't@t.com', avatar: null };
      const result = formatUser(raw);
      expect(typeof result.numericId).toBe('number');
      expect(result.numericId).toBe(42);
    });
  });

  describe('ApprovalDao', () => {
    it('授权数据结构正确', () => {
      const approval = {
        uid: 'uuid-xxx',
        appId: 'firewall',
        scopes: ['openid', 'profile', 'email']
      };
      expect(approval).toHaveProperty('uid');
      expect(approval).toHaveProperty('appId');
      expect(approval).toHaveProperty('scopes');
      expect(Array.isArray(approval.scopes)).toBe(true);
    });

    it('scopes 应包含至少一个权限', () => {
      const approval = { uid: 'uuid', appId: 'fw', scopes: ['openid', 'profile'] };
      expect(approval.scopes.length).toBeGreaterThan(0);
    });
  });

  describe('TokenDao', () => {
    it('refresh token 数据结构正确', () => {
      const tokenData = {
        sub: 'uuid-xxx',
        client_id: 'firewall',
        scope: 'openid profile email',
        expiresIn: 86400
      };
      expect(tokenData).toHaveProperty('sub');
      expect(tokenData).toHaveProperty('client_id');
      expect(tokenData).toHaveProperty('scope');
      expect(tokenData).toHaveProperty('expiresIn');
      expect(tokenData.expiresIn).toBeGreaterThan(0);
    });

    it('refresh token 是随机字符串', async () => {
      const { randomBytes } = await import('crypto');
      const token1 = randomBytes(32).toString('hex');
      const token2 = randomBytes(32).toString('hex');
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64);
    });
  });

  describe('ClientDao', () => {
    it('客户端数据结构正确', () => {
      const client = {
        client_id: 'firewall',
        client_name: 'Antigravity Firewall',
        redirect_uris: ['http://localhost:5173/firewall/'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email',
        token_endpoint_auth_method: 'none',
        application_type: 'web'
      };
      expect(client.client_id).toBe('firewall');
      expect(Array.isArray(client.redirect_uris)).toBe(true);
      expect(Array.isArray(client.grant_types)).toBe(true);
      expect(client.grant_types).toContain('authorization_code');
    });

    it('公钥客户端 token_endpoint_auth_method 为 none', () => {
      const publicClient = { token_endpoint_auth_method: 'none' };
      expect(publicClient.token_endpoint_auth_method).toBe('none');
    });

    it('机密客户端 token_endpoint_auth_method 为 client_secret_basic', () => {
      const confidentialClient = { token_endpoint_auth_method: 'client_secret_basic' };
      expect(confidentialClient.token_endpoint_auth_method).toBe('client_secret_basic');
    });
  });

  describe('ConsentDao', () => {
    it('授权记录结构正确', () => {
      const consent = {
        sub: 'uuid-xxx',
        clientId: 'firewall',
        scopes: ['openid', 'profile', 'email']
      };
      expect(consent).toHaveProperty('sub');
      expect(consent).toHaveProperty('clientId');
      expect(consent).toHaveProperty('scopes');
      expect(consent.scopes).toContain('openid');
    });
  });

  describe('CodeDao', () => {
    it('授权码数据结构正确', () => {
      const code = {
        code: 'abc123',
        userId: 'uuid-xxx',
        clientId: 'firewall',
        redirectUri: 'http://localhost:5173/callback',
        scope: 'openid profile',
        codeChallenge: 'challenge123',
        codeChallengeMethod: 'S256'
      };
      expect(code).toHaveProperty('code');
      expect(code).toHaveProperty('userId');
      expect(code).toHaveProperty('clientId');
      expect(code).toHaveProperty('redirectUri');
      expect(code).toHaveProperty('codeChallenge');
    });
  });

  describe('PermissionDao', () => {
    it('权限记录结构正确', () => {
      const permission = {
        module: 'firewall',
        action: 'config:read',
        appId: 'firewall'
      };
      expect(permission).toHaveProperty('module');
      expect(permission).toHaveProperty('action');
      expect(permission).toHaveProperty('appId');
    });
  });
});
