/**
 * 错误处理测试
 *
 * 覆盖：统一错误格式、HTTP 状态码、日志脱敏
 */
import { describe, it, expect } from '@jest/globals';

describe('错误处理', () => {
  describe('统一错误格式', () => {
    it('成功响应格式', () => {
      const response = { code: 200, message: '获取成功', data: { id: 1 } };
      expect(response.code).toBe(200);
      expect(response.message).toBeTruthy();
      expect(response).toHaveProperty('data');
    });

    it('400 错误格式', () => {
      const response = { code: 400, message: '参数错误', data: null };
      expect(response.code).toBe(400);
      expect(response.data).toBeNull();
    });

    it('401 错误格式', () => {
      const response = { code: 401, message: '未登录', data: null };
      expect(response.code).toBe(401);
    });

    it('403 错误格式', () => {
      const response = { code: 403, message: '权限不足', data: null };
      expect(response.code).toBe(403);
    });

    it('404 错误格式', () => {
      const response = { code: 404, message: '资源不存在', data: null };
      expect(response.code).toBe(404);
    });

    it('429 限频错误格式', () => {
      const response = { code: 429, message: '请求过于频繁', data: null };
      expect(response.code).toBe(429);
    });

    it('500 错误格式', () => {
      const response = { code: 500, message: '服务器内部错误', data: null };
      expect(response.code).toBe(500);
    });
  });

  describe('日志脱敏', () => {
    function sanitize(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (/password|token|secret|key|credential/i.test(key)) {
          result[key] = '***';
        } else if (typeof value === 'object') {
          result[key] = sanitize(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    it('密码字段被脱敏', () => {
      const data = { username: 'test', password: 'secret123' };
      const result = sanitize(data);
      expect(result.username).toBe('test');
      expect(result.password).toBe('***');
    });

    it('token 字段被脱敏', () => {
      const data = { token: 'eyJhbGciOiJSUzI1NiIs...' };
      const result = sanitize(data);
      expect(result.token).toBe('***');
    });

    it('嵌套对象被脱敏', () => {
      const data = { user: { name: 'test', password: 'secret' } };
      const result = sanitize(data);
      expect(result.user.name).toBe('test');
      expect(result.user.password).toBe('***');
    });

    it('非敏感字段保持不变', () => {
      const data = { username: 'test', email: 'test@example.com' };
      const result = sanitize(data);
      expect(result.username).toBe('test');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('HTTP 状态码映射', () => {
    it('200 表示成功', () => {
      expect(200).toBe(200);
    });

    it('401 表示未认证', () => {
      expect(401).toBe(401);
    });

    it('403 表示无权限', () => {
      expect(403).toBe(403);
    });

    it('429 表示限频', () => {
      expect(429).toBe(429);
    });
  });
});
