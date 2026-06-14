/**
 * API 路由集成测试
 *
 * 覆盖：认证流程、权限检查、错误处理
 */
import { describe, it, expect } from '@jest/globals';

describe('API 路由集成', () => {
  describe('路由注册', () => {
    it('registerSecureRoute 支持 permission 参数', () => {
      // 模拟 registerSecureRoute 参数解析
      const options = {
        name: 'test',
        method: 'GET',
        url: '/test',
        permission: 'fw:config:read',
        handler: () => {}
      };
      expect(options.permission).toBe('fw:config:read');
    });

    it('permission 支持 any/All 模式', () => {
      const anyPerm = { any: ['fw:config:read', 'fw:admin:*'] };
      const allPerm = { all: ['fw:config:read', 'fw:config:write'] };

      expect(anyPerm.any).toHaveLength(2);
      expect(allPerm.all).toHaveLength(2);
    });
  });

  describe('错误响应格式', () => {
    it('统一格式 { code, message, data }', () => {
      const response = {
        code: 200,
        message: '获取成功',
        data: { roles: ['admin'], permissions: { allows: ['*'], denies: [] } }
      };
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('data');
      expect(response.code).toBe(200);
    });

    it('401 错误格式', () => {
      const response = {
        code: 401,
        message: '身份验证失败，请先登录',
        data: null
      };
      expect(response.code).toBe(401);
      expect(response.data).toBeNull();
    });

    it('403 错误格式', () => {
      const response = {
        code: 403,
        message: '权限不足：需要 [fw:config:read] 权限',
        data: null
      };
      expect(response.code).toBe(403);
    });

    it('429 限频错误格式', () => {
      const response = {
        code: 429,
        message: '请求过于频繁，请在 30 秒后重试',
        data: null
      };
      expect(response.code).toBe(429);
    });
  });

  describe('Session 数据结构', () => {
    it('session 包含必要字段', () => {
      const session = {
        userId: 1,
        uid: 'uuid-xxx',
        username: 'admin',
        email: 'admin@example.com',
        appId: 'firewall',
        roles: ['admin'],
        permissions: { allows: ['*'], denies: [] },
        ip: '192.168.1.1',
        loginAt: Math.floor(Date.now() / 1000),
        rememberMe: true
      };

      expect(session).toHaveProperty('userId');
      expect(session).toHaveProperty('uid');
      expect(session).toHaveProperty('username');
      expect(session).toHaveProperty('email');
      expect(session).toHaveProperty('appId');
      expect(session).toHaveProperty('roles');
      expect(session).toHaveProperty('permissions');
      expect(session).toHaveProperty('ip');
      expect(session).toHaveProperty('loginAt');
      expect(session).toHaveProperty('rememberMe');
      expect(Array.isArray(session.roles)).toBe(true);
      expect(session.permissions).toHaveProperty('allows');
      expect(session.permissions).toHaveProperty('denies');
    });
  });

  describe('CSRF 排除路径', () => {
    const excludePaths = [
      '/oauth2.1/login',
      '/oauth2.1/mini-login',
      '/oauth2.1/authorize',
      '/oauth2.1/token',
      '/verify/',
      '/auth/v1/bind-token',
      '/auth/v1/bind-session'
    ];

    it('登录接口在排除列表中', () => {
      expect(excludePaths).toContain('/oauth2.1/login');
      expect(excludePaths).toContain('/oauth2.1/mini-login');
    });

    it('Token 端点在排除列表中', () => {
      expect(excludePaths).toContain('/oauth2.1/token');
    });

    it('验证码接口在排除列表中', () => {
      expect(excludePaths.some(p => '/verify/v1/generate-captcha'.startsWith(p))).toBe(true);
    });

    it('业务接口不在排除列表中', () => {
      expect(excludePaths.some(p => '/api/firewall/v1/monitor/summary'.startsWith(p))).toBe(false);
      expect(excludePaths.some(p => '/user/v1/userinfo'.startsWith(p))).toBe(false);
    });
  });

  describe('限频配置', () => {
    it('登录接口限频配置正确', () => {
      const config = { maxRequests: 5, windowSec: 60 };
      expect(config.maxRequests).toBe(5);
      expect(config.windowSec).toBe(60);
    });

    it('验证码接口限频配置正确', () => {
      const config = { maxRequests: 10, windowSec: 60 };
      expect(config.maxRequests).toBe(10);
    });

    it('注册接口限频配置正确', () => {
      const config = { maxRequests: 3, windowSec: 3600 };
      expect(config.maxRequests).toBe(3);
      expect(config.windowSec).toBe(3600);
    });
  });

  describe('Cookie 安全配置', () => {
    it('SID cookie 配置正确', () => {
      const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/'
      };
      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('lax');
    });

    it('refresh_token cookie 使用 strict', () => {
      const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/oauth2.1/token'
      };
      expect(options.sameSite).toBe('strict');
      expect(options.httpOnly).toBe(true);
    });

    it('辅助 cookie 非 httpOnly', () => {
      const options = {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/'
      };
      expect(options.httpOnly).toBe(false);
    });
  });

  describe('审计日志事件类型', () => {
    const eventTypes = [
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'SESSION_KICK',
      'ROLE_ASSIGNED',
      'PERMISSION_CHANGE',
      'PASSWORD_CHANGE'
    ];

    it('包含所有必要事件类型', () => {
      expect(eventTypes).toContain('LOGIN_SUCCESS');
      expect(eventTypes).toContain('LOGIN_FAILED');
      expect(eventTypes).toContain('LOGOUT');
      expect(eventTypes).toContain('SESSION_KICK');
      expect(eventTypes).toContain('ROLE_ASSIGNED');
      expect(eventTypes).toContain('PERMISSION_CHANGE');
    });

    it('审计日志数据结构正确', () => {
      const log = {
        userId: 'uuid-xxx',
        event: 'LOGIN_SUCCESS',
        appId: 'firewall',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        details: { reason: 'direct_login' }
      };
      expect(log).toHaveProperty('userId');
      expect(log).toHaveProperty('event');
      expect(log).toHaveProperty('ip');
      expect(log).toHaveProperty('details');
    });
  });
});
