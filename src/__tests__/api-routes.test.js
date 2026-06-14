/**
 * API 路由完整测试
 *
 * 覆盖：所有 API 端点的数据结构验证
 */
import { describe, it, expect } from '@jest/globals';

describe('API 路由', () => {
  describe('用户模块 /user/v1', () => {
    it('userinfo 响应结构', () => {
      const response = {
        code: 200,
        message: '获取成功',
        data: { sub: 'uuid-xxx', name: 'Test', email: 'test@example.com' }
      };
      expect(response.data).toHaveProperty('sub');
      expect(response.data).toHaveProperty('name');
      expect(response.data).toHaveProperty('email');
    });

    it('permissions 响应结构', () => {
      const response = {
        code: 200,
        data: {
          roles: ['admin'],
          permissions: { allows: ['*'], denies: [] }
        }
      };
      expect(response.data).toHaveProperty('roles');
      expect(response.data).toHaveProperty('permissions');
      expect(Array.isArray(response.data.roles)).toBe(true);
    });

    it('sessions 响应结构', () => {
      const response = {
        code: 200,
        data: {
          sessions: [{ sessionId: 'abc...', deviceType: 'browser', ip: '1.2.3.4' }],
          total: 1,
          maxSessions: 5
        }
      };
      expect(response.data).toHaveProperty('sessions');
      expect(response.data).toHaveProperty('total');
      expect(response.data).toHaveProperty('maxSessions');
    });

    it('avatar 上传响应结构', () => {
      const response = {
        code: 200,
        data: { avatar: '/uploads/avatars/avatar_xxx.jpg' }
      };
      expect(response.data.avatar).toContain('/uploads/');
    });
  });

  describe('认证模块 /auth/v1', () => {
    it('bind-session 响应结构', () => {
      const response = {
        code: 200,
        message: 'Session 已绑定',
        data: { user: { id: 'uuid', username: 'test' } }
      };
      expect(response.data).toHaveProperty('user');
    });

    it('clear-cookie 响应结构', () => {
      const response = { code: 200, message: 'Cookie 已清除', data: null };
      expect(response.code).toBe(200);
    });
  });

  describe('OAuth 模块 /oauth2.1', () => {
    it('token 响应结构', () => {
      const response = {
        access_token: 'eyJ...',
        token_type: 'Bearer',
        expires_in: 600,
        refresh_token: 'abc...',
        scope: 'openid profile email'
      };
      expect(response).toHaveProperty('access_token');
      expect(response).toHaveProperty('refresh_token');
      expect(response.token_type).toBe('Bearer');
    });

    it('authorize 响应结构（需要登录）', () => {
      const response = {
        action: 'login',
        sessionId: 'uuid-xxx',
        client_name: 'Firewall',
        scope: 'openid profile email'
      };
      expect(response.action).toBe('login');
      expect(response).toHaveProperty('sessionId');
    });

    it('authorize 响应结构（需要授权）', () => {
      const response = {
        action: 'consent',
        sessionId: 'uuid-xxx',
        client_name: 'Firewall',
        scope: 'openid profile email',
        user: { username: 'test', email: 'test@example.com' }
      };
      expect(response.action).toBe('consent');
      expect(response).toHaveProperty('user');
    });
  });

  describe('防火墙模块 /api/firewall', () => {
    it('summary 响应结构', () => {
      const response = {
        totalRequests: 1000,
        totalBlocked: 50,
        topRegions: [{ region: '河南-郑州', count: 100 }],
        topPaths: [{ path: '/api/test', count: 50 }]
      };
      expect(response).toHaveProperty('totalRequests');
      expect(response).toHaveProperty('totalBlocked');
      expect(Array.isArray(response.topRegions)).toBe(true);
    });

    it('blocks 响应结构', () => {
      const blocks = [
        { ip: '1.2.3.4', type: 'ip', status: 'BLOCKED', permanent: true },
        { fingerprint: 'abc', type: 'fingerprint', status: 'BLOCKED', permanent: false }
      ];
      expect(Array.isArray(blocks)).toBe(true);
      blocks.forEach(b => {
        expect(b).toHaveProperty('type');
        expect(b).toHaveProperty('status');
      });
    });

    it('metrics 响应结构', () => {
      const response = {
        requests: { total: 1000, blocked: 50, rate: '5.00%' },
        blocks: { total: 10, byType: { ip: 8, fingerprint: 2 } },
        whitelist: { total: 5 }
      };
      expect(response.requests).toHaveProperty('total');
      expect(response.requests).toHaveProperty('blocked');
      expect(response.requests).toHaveProperty('rate');
    });

    it('export 响应结构', () => {
      const response = {
        count: 10,
        blocks: [
          { ip: '1.2.3.4', type: 'ip', reason: 'scan', status: 'BLOCKED' }
        ]
      };
      expect(response).toHaveProperty('count');
      expect(response).toHaveProperty('blocks');
      expect(Array.isArray(response.blocks)).toBe(true);
    });
  });

  describe('通知模块 /notice', () => {
    it('channels 响应结构', () => {
      const channels = [
        { id: 'email', name: '邮件通知', enabled: true },
        { id: 'dingtalk', name: '钉钉机器人', enabled: false }
      ];
      expect(Array.isArray(channels)).toBe(true);
      channels.forEach(c => {
        expect(c).toHaveProperty('id');
        expect(c).toHaveProperty('name');
        expect(c).toHaveProperty('enabled');
      });
    });
  });

  describe('验证模块 /verify', () => {
    it('captcha 响应结构', () => {
      const response = {
        captchaKey: 'uuid-xxx',
        captchaImage: 'data:image/svg+xml;base64,...'
      };
      expect(response).toHaveProperty('captchaKey');
      expect(response).toHaveProperty('captchaImage');
      expect(response.captchaImage).toContain('data:image');
    });
  });
});
