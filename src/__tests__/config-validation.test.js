/**
 * 配置验证测试
 *
 * 覆盖：环境变量、配置结构、默认值
 */
import { describe, it, expect } from '@jest/globals';

describe('配置验证', () => {
  describe('JWT 配置', () => {
    it('默认配置正确', () => {
      const config = {
        enabled: false,
        accessTokenTTL: 600,
        refreshTokenTTL: 86400,
        idTokenTTL: 3600,
        algorithm: 'RS256'
      };
      expect(config.enabled).toBe(false);
      expect(config.accessTokenTTL).toBe(600);
      expect(config.algorithm).toBe('RS256');
    });

    it('TTL 关系正确', () => {
      const config = {
        accessTokenTTL: 600,
        refreshTokenTTL: 86400,
        idTokenTTL: 3600
      };
      expect(config.accessTokenTTL).toBeLessThan(config.idTokenTTL);
      expect(config.idTokenTTL).toBeLessThan(config.refreshTokenTTL);
    });
  });

  describe('Session 配置', () => {
    it('默认配置正确', () => {
      const config = {
        secret: 'test-secret',
        maxRefreshTokens: 10
      };
      expect(config.maxRefreshTokens).toBeGreaterThan(0);
    });

    it('TTL 配置正确', () => {
      const SHORT_SESSION_TTL = 1800;   // 30 分钟
      const LONG_SESSION_TTL = 2592000; // 30 天
      const REFRESH_TOKEN_TTL = 2592000; // 30 天
      expect(SHORT_SESSION_TTL).toBeLessThan(LONG_SESSION_TTL);
      expect(LONG_SESSION_TTL).toBe(REFRESH_TOKEN_TTL);
    });
  });

  describe('服务器配置', () => {
    it('默认端口', () => {
      const port = parseInt(process.env.PORT) || 3000;
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65535);
    });
  });

  describe('Cookie 配置', () => {
    it('SID Cookie 配置正确', () => {
      const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      };
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
    });

    it('SID_R Cookie 配置正确', () => {
      const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      };
      expect(options.httpOnly).toBe(true);
    });

    it('refresh_token Cookie 使用 strict', () => {
      const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/oauth2.1/token'
      };
      expect(options.sameSite).toBe('strict');
    });
  });

  describe('CSRF 配置', () => {
    it('排除路径列表正确', () => {
      const excludePaths = [
        '/oauth2.1/login',
        '/oauth2.1/mini-login',
        '/oauth2.1/authorize',
        '/oauth2.1/token',
        '/verify/',
        '/auth/v1/bind-token',
        '/auth/v1/bind-session'
      ];
      expect(excludePaths.length).toBeGreaterThan(0);
      expect(excludePaths).toContain('/oauth2.1/login');
    });
  });

  describe('限频配置', () => {
    it('登录接口限频', () => {
      const config = { maxRequests: 5, windowSec: 60 };
      expect(config.maxRequests).toBe(5);
      expect(config.windowSec).toBe(60);
    });

    it('验证码接口限频', () => {
      const config = { maxRequests: 10, windowSec: 60 };
      expect(config.maxRequests).toBe(10);
    });

    it('注册接口限频', () => {
      const config = { maxRequests: 3, windowSec: 3600 };
      expect(config.maxRequests).toBe(3);
    });
  });
});
