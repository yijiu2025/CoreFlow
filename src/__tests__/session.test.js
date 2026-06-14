/**
 * Session 管理测试
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// 测试 cookie 签名/验证逻辑
describe('session', () => {
  describe('cookie signing', () => {
    // 模拟 signCookie 和 verifyCookie 逻辑
    const SECRET = 'test-secret';

    function signCookie(sessionId, accessCount) {
      const payload = `${sessionId}:${accessCount}`;
      const encoded = Buffer.from(payload).toString('base64url');
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(encoded)
        .digest('base64url');
      return `${encoded}.${signature}`;
    }

    function verifyCookie(cookieValue) {
      if (!cookieValue) return null;
      const parts = cookieValue.split('.');
      if (parts.length !== 2) return null;
      const [encoded, signature] = parts;
      const expectedSig = crypto
        .createHmac('sha256', SECRET)
        .update(encoded)
        .digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return null;
      }
      const decoded = Buffer.from(encoded, 'base64url').toString();
      const [sessionId, countStr] = decoded.split(':');
      return { sessionId, accessCount: parseInt(countStr, 10) };
    }

    it('签名和验证正常工作', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie = signCookie(sessionId, 0);
      const result = verifyCookie(cookie);
      expect(result).not.toBeNull();
      expect(result.sessionId).toBe(sessionId);
      expect(result.accessCount).toBe(0);
    });

    it('篡改 cookie 返回 null', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie = signCookie(sessionId, 0);
      const tampered = cookie.slice(0, -5) + 'XXXXX';
      expect(verifyCookie(tampered)).toBeNull();
    });

    it('空值返回 null', () => {
      expect(verifyCookie(null)).toBeNull();
      expect(verifyCookie('')).toBeNull();
    });

    it('格式错误返回 null', () => {
      expect(verifyCookie('no-dot')).toBeNull();
      expect(verifyCookie('a.b.c')).toBeNull();
    });

    it('accessCount 递增后仍可验证', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie0 = signCookie(sessionId, 0);
      const cookie5 = signCookie(sessionId, 5);

      expect(verifyCookie(cookie0).accessCount).toBe(0);
      expect(verifyCookie(cookie5).accessCount).toBe(5);
    });
  });

  describe('session data structure', () => {
    it('包含必要字段', () => {
      const sessionData = {
        userId: 1,
        uid: 'uuid-xxx',
        username: 'test',
        email: 'test@example.com',
        appId: 'firewall',
        roles: ['admin'],
        permissions: { allows: ['*'], denies: [] },
        loginAt: Math.floor(Date.now() / 1000),
        lastActiveAt: Math.floor(Date.now() / 1000),
        rememberMe: false
      };

      expect(sessionData).toHaveProperty('userId');
      expect(sessionData).toHaveProperty('uid');
      expect(sessionData).toHaveProperty('username');
      expect(sessionData).toHaveProperty('email');
      expect(sessionData).toHaveProperty('appId');
      expect(sessionData).toHaveProperty('roles');
      expect(sessionData).toHaveProperty('permissions');
      expect(sessionData).toHaveProperty('loginAt');
      expect(sessionData).toHaveProperty('rememberMe');
    });
  });
});
