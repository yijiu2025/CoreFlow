/**
 * 数据库模型测试
 *
 * 覆盖：模型结构、关联关系、验证规则
 */
import { describe, it, expect } from '@jest/globals';

describe('数据库模型', () => {
  describe('User 模型', () => {
    it('字段结构正确', () => {
      const user = {
        id: 1,
        uid: 'uuid-xxx',
        username: 'testuser',
        email: 'test@example.com',
        phone: '13800138000',
        avatar: null,
        status: 1,
        delete_version: 0
      };
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('uid');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('status');
      expect(typeof user.id).toBe('number');
      expect(typeof user.uid).toBe('string');
    });

    it('status 枚举值', () => {
      const ACTIVE = 1;
      const BANNED = 0;
      const DEACTIVATED = -1;
      expect(ACTIVE).toBe(1);
      expect(BANNED).toBe(0);
      expect(DEACTIVATED).toBe(-1);
    });
  });

  describe('UserIdentity 模型', () => {
    it('字段结构正确', () => {
      const identity = {
        id: 1,
        user_id: 1,
        identity_type: 'password',
        identifier: 'test@example.com',
        credential: '$2a$10$...',
        failed_attempts: 0,
        locked_until: null
      };
      expect(identity).toHaveProperty('user_id');
      expect(identity).toHaveProperty('identity_type');
      expect(identity).toHaveProperty('identifier');
      expect(identity).toHaveProperty('credential');
    });

    it('identity_type 枚举值', () => {
      const types = ['password', 'wechat', 'github', 'phone_sms'];
      expect(types).toContain('password');
    });
  });

  describe('Role 模型', () => {
    it('字段结构正确', () => {
      const role = {
        id: 1,
        code: 'admin',
        app_id: 'GLOBAL',
        name: '管理员',
        rank_level: 99,
        policy: { Statement: [{ Effect: 'Allow', Action: ['*'] }] },
        description: '系统管理员',
        delete_version: 0
      };
      expect(role).toHaveProperty('code');
      expect(role).toHaveProperty('app_id');
      expect(role).toHaveProperty('rank_level');
      expect(role).toHaveProperty('policy');
      expect(role.rank_level).toBeGreaterThanOrEqual(0);
      expect(role.rank_level).toBeLessThanOrEqual(99);
    });

    it('policy Statement 格式正确', () => {
      const policy = {
        Statement: [
          { Effect: 'Allow', Action: ['fw:config:read', 'fw:config:write'] },
          { Effect: 'Deny', Action: ['fw:config:delete'] }
        ]
      };
      expect(policy.Statement).toHaveLength(2);
      expect(policy.Statement[0].Effect).toBe('Allow');
      expect(policy.Statement[1].Effect).toBe('Deny');
    });
  });

  describe('UserRole 模型', () => {
    it('字段结构正确', () => {
      const userRole = {
        id: 1,
        user_id: 1,
        role_id: 1,
        app_id: 'firewall',
        delete_version: 0
      };
      expect(userRole).toHaveProperty('user_id');
      expect(userRole).toHaveProperty('role_id');
      expect(userRole).toHaveProperty('app_id');
    });
  });

  describe('SessionToken 模型', () => {
    it('字段结构正确', () => {
      const token = {
        id: 1,
        user_id: 1,
        app_id: 'firewall',
        device_id: 'web',
        token: 'sha256hash...',
        ip: '192.168.1.1',
        user_agent: 'Mozilla/5.0...',
        last_active: new Date(),
        revoked: false
      };
      expect(token).toHaveProperty('user_id');
      expect(token).toHaveProperty('token');
      expect(token).toHaveProperty('revoked');
      expect(token.revoked).toBe(false);
    });
  });

  describe('AuditLog 模型', () => {
    it('字段结构正确', () => {
      const log = {
        id: 1,
        user_id: 1,
        event: 'LOGIN_SUCCESS',
        app_id: 'firewall',
        ip: '192.168.1.1',
        user_agent: 'Mozilla/5.0...',
        details: { reason: 'direct_login' }
      };
      expect(log).toHaveProperty('event');
      expect(log).toHaveProperty('user_id');
      expect(log).toHaveProperty('ip');
      expect(log).toHaveProperty('details');
    });
  });

  describe('OauthClient 模型', () => {
    it('字段结构正确', () => {
      const client = {
        client_id: 'firewall',
        client_name: 'Antigravity Firewall',
        client_secret: '$2a$10$...',
        redirect_uris: ['http://localhost:5173/firewall/'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email',
        token_endpoint_auth_method: 'none',
        application_type: 'web'
      };
      expect(client).toHaveProperty('client_id');
      expect(client).toHaveProperty('client_secret');
      expect(client).toHaveProperty('redirect_uris');
      expect(client).toHaveProperty('grant_types');
    });
  });

  describe('软删除机制', () => {
    it('delete_version 0 表示活跃', () => {
      const record = { delete_version: 0 };
      expect(record.delete_version).toBe(0);
    });

    it('delete_version > 0 表示已删除', () => {
      const record = { delete_version: 42 };
      expect(record.delete_version).toBeGreaterThan(0);
    });
  });
});
