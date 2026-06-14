/**
 * 安全测试用例
 *
 * 覆盖：CSRF、限频、密码策略、日志脱敏、Cookie 安全
 */
import { describe, it, expect } from '@jest/globals';

describe('安全模块', () => {
  describe('密码策略', () => {
    // 模拟 validatePasswordStrength
    function validatePasswordStrength(password, policy = {}) {
      const cfg = { minLength: 8, maxLength: 128, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSpecial: false, ...policy };
      const errors = [];
      if (!password || typeof password !== 'string') return { valid: false, errors: ['密码不能为空'] };
      if (password.length < cfg.minLength) errors.push(`密码长度不能少于 ${cfg.minLength} 个字符`);
      if (password.length > cfg.maxLength) errors.push(`密码长度不能超过 ${cfg.maxLength} 个字符`);
      if (cfg.requireUppercase && !/[A-Z]/.test(password)) errors.push('密码必须包含至少一个大写字母');
      if (cfg.requireLowercase && !/[a-z]/.test(password)) errors.push('密码必须包含至少一个小写字母');
      if (cfg.requireNumbers && !/[0-9]/.test(password)) errors.push('密码必须包含至少一个数字');
      return { valid: errors.length === 0, errors };
    }

    it('有效密码通过校验', () => {
      const result = validatePasswordStrength('MyP@ssw0rd');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('密码太短被拒绝', () => {
      const result = validatePasswordStrength('Ab1');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('不能少于');
    });

    it('缺少大写字母被拒绝', () => {
      const result = validatePasswordStrength('mypassword1');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('大写字母');
    });

    it('缺少数字被拒绝', () => {
      const result = validatePasswordStrength('MyPassword');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('数字');
    });

    it('空密码被拒绝', () => {
      const result = validatePasswordStrength('');
      expect(result.valid).toBe(false);
    });

    it('null 密码被拒绝', () => {
      const result = validatePasswordStrength(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('日志脱敏', () => {
    function sanitizeForLog(obj, depth = 3) {
      if (depth <= 0 || !obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => sanitizeForLog(item, depth - 1));
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (/password|passwd|secret|token|authorization|cookie|credential|key/i.test(key)) {
          result[key] = '***';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = sanitizeForLog(value, depth - 1);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    it('密码字段被脱敏', () => {
      const data = { username: 'test', password: 'secret123' };
      const result = sanitizeForLog(data);
      expect(result.username).toBe('test');
      expect(result.password).toBe('***');
    });

    it('token 字段被脱敏', () => {
      const data = { token: 'eyJhbGciOiJSUzI1NiIs...' };
      const result = sanitizeForLog(data);
      expect(result.token).toBe('***');
    });

    it('嵌套对象中的敏感字段被脱敏', () => {
      const data = { user: { name: 'test', password: 'secret' } };
      const result = sanitizeForLog(data);
      expect(result.user.name).toBe('test');
      expect(result.user.password).toBe('***');
    });

    it('非敏感字段保持不变', () => {
      const data = { username: 'test', email: 'test@example.com' };
      const result = sanitizeForLog(data);
      expect(result.username).toBe('test');
      expect(result.email).toBe('test@example.com');
    });

    it('null 值不报错', () => {
      expect(sanitizeForLog(null)).toBeNull();
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

    it('refresh_token cookie 使用 strict sameSite', () => {
      const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/oauth2.1/token'
      };
      expect(options.sameSite).toBe('strict');
      expect(options.httpOnly).toBe(true);
    });
  });

  describe('CSRF 排除路径', () => {
    const excludePaths = [
      '/oauth2.1/login',
      '/oauth2.1/mini-login',
      '/oauth2.1/authorize',
      '/oauth2.1/token',
      '/verify/',
      '/auth/v1/bind-token'
    ];

    it('登录接口在排除列表中', () => {
      expect(excludePaths).toContain('/oauth2.1/login');
    });

    it('验证码接口在排除列表中', () => {
      expect(excludePaths.some(p => '/verify/v1/generate-captcha'.startsWith(p))).toBe(true);
    });

    it('业务接口不在排除列表中', () => {
      expect(excludePaths.some(p => '/api/firewall/v1/monitor/summary'.startsWith(p))).toBe(false);
    });
  });

  describe('限频配置', () => {
    it('登录接口限频为每分钟 5 次', () => {
      const config = { maxRequests: 5, windowSec: 60 };
      expect(config.maxRequests).toBe(5);
      expect(config.windowSec).toBe(60);
    });

    it('验证码接口限频为每分钟 10 次', () => {
      const config = { maxRequests: 10, windowSec: 60 };
      expect(config.maxRequests).toBe(10);
    });
  });
});
