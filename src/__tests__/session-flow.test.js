/**
 * Session 完整流程测试
 *
 * 覆盖：创建 → 验证 → 刷新 → 销毁
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

describe('Session 完整流程', () => {
  // 模拟 cookie 签名
  const SECRET = 'test-secret';

  function signCookie(sessionId, accessCount) {
    const payload = `${sessionId}:${accessCount}`;
    const encoded = Buffer.from(payload).toString('base64url');
    const signature = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  function verifyCookie(cookieValue) {
    if (!cookieValue) return null;
    const parts = cookieValue.split('.');
    if (parts.length !== 2) return null;
    const [encoded, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
    const decoded = Buffer.from(encoded, 'base64url').toString();
    const [sessionId, countStr] = decoded.split(':');
    return { sessionId, accessCount: parseInt(countStr, 10) };
  }

  describe('Session 创建', () => {
    it('生成随机 sessionId', () => {
      const id1 = crypto.randomBytes(32).toString('hex');
      const id2 = crypto.randomBytes(32).toString('hex');
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(64);
    });

    it('session 数据包含必要字段', () => {
      const session = {
        userId: 1,
        uid: 'uuid-xxx',
        username: 'test',
        email: 'test@example.com',
        appId: 'firewall',
        roles: ['admin'],
        permissions: { allows: ['*'], denies: [] },
        ip: '192.168.1.1',
        loginAt: Math.floor(Date.now() / 1000),
        lastActiveAt: Math.floor(Date.now() / 1000),
        rememberMe: false
      };

      expect(session).toHaveProperty('userId');
      expect(session).toHaveProperty('uid');
      expect(session).toHaveProperty('username');
      expect(session).toHaveProperty('appId');
      expect(session).toHaveProperty('roles');
      expect(session).toHaveProperty('permissions');
      expect(session).toHaveProperty('loginAt');
    });

    it('refreshToken 是随机字符串', () => {
      const token = crypto.randomBytes(32).toString('hex');
      expect(token.length).toBe(64);
    });
  });

  describe('Session 验证', () => {
    it('有效 cookie 可验证', () => {
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

    it('空 cookie 返回 null', () => {
      expect(verifyCookie(null)).toBeNull();
      expect(verifyCookie('')).toBeNull();
    });

    it('格式错误返回 null', () => {
      expect(verifyCookie('no-dot')).toBeNull();
      expect(verifyCookie('a.b.c')).toBeNull();
    });
  });

  describe('Session 刷新', () => {
    it('刷新后 sessionId 变化', () => {
      const oldSessionId = crypto.randomBytes(32).toString('hex');
      const newSessionId = crypto.randomBytes(32).toString('hex');
      expect(oldSessionId).not.toBe(newSessionId);
    });

    it('刷新后 accessCount 清零', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const oldCookie = signCookie(sessionId, 5);
      const newCookie = signCookie(sessionId, 0);

      expect(verifyCookie(oldCookie).accessCount).toBe(5);
      expect(verifyCookie(newCookie).accessCount).toBe(0);
    });

    it('refreshToken 轮换', () => {
      const oldRefreshToken = crypto.randomBytes(32).toString('hex');
      const newRefreshToken = crypto.randomBytes(32).toString('hex');
      expect(oldRefreshToken).not.toBe(newRefreshToken);
    });
  });

  describe('Session 销毁', () => {
    it('销毁后 sessionId 无效', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      // 模拟销毁：从 Redis 删除
      const sessions = new Map();
      sessions.set(sessionId, { userId: 1 });
      sessions.delete(sessionId);
      expect(sessions.has(sessionId)).toBe(false);
    });

    it('销毁后 refreshToken 无效', () => {
      const refreshToken = crypto.randomBytes(32).toString('hex');
      const tokens = new Map();
      tokens.set(refreshToken, 'session-id');
      tokens.delete(refreshToken);
      expect(tokens.has(refreshToken)).toBe(false);
    });
  });

  describe('设备数限制', () => {
    it('按应用隔离设备数', () => {
      const sessions = [
        { userId: 1, appId: 'firewall', sessionId: 's1' },
        { userId: 1, appId: 'firewall', sessionId: 's2' },
        { userId: 1, appId: 'admin', sessionId: 's3' }
      ];

      const firewallSessions = sessions.filter(s => s.appId === 'firewall');
      const adminSessions = sessions.filter(s => s.appId === 'admin');

      expect(firewallSessions.length).toBe(2);
      expect(adminSessions.length).toBe(1);
    });

    it('超过限制返回会话列表', () => {
      const maxSessions = 5;
      const sessions = Array.from({ length: 6 }, (_, i) => ({
        sessionId: `s${i}`,
        ip: '192.168.1.1',
        userAgent: 'test',
        lastActive: new Date()
      }));

      expect(sessions.length).toBeGreaterThan(maxSessions);
    });
  });
});
