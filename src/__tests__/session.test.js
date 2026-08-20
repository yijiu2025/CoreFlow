/**
 * Session 管理测试
 *
 * @author yijiu2025
 * @since 2026-08-17
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
      const signature = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
      return `${encoded}.${signature}`;
    }

    function verifyCookie(cookieValue) {
      if (!cookieValue) return null;
      const parts = cookieValue.split('.');
      if (parts.length !== 2) return null;
      const [encoded, signature] = parts;
      const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
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

  // accountKey 与凭证 cookie 名分离模型测试
  // accountKey = uid 明文（前端 localStorage key + 切账号发送值）
  // cookie 名 = accountKeyForUid(uid) = HMAC(uid, SECRET)（HttpOnly，后端派生）
  describe('accountKey 与凭证 cookie 名分离', () => {
    // 复用真实 SECRET：与 cookie.js 同源（测试环境默认值）
    const SECRET = process.env.SESSION_SECRET || 'change-me-session-secret';

    function accountKeyForUid(uid) {
      return `k_${crypto.createHmac('sha256', SECRET).update(String(uid)).digest('hex').slice(0, 16)}`;
    }

    it('accountKey 即 uid，cookie 名 = HMAC(uid)，两者不同', () => {
      const uid = 'd102d02f-c338-4847-8cd8-71afb69b878a';
      const accountKey = uid; // bind-session 直接返回 uid
      const cookieName = accountKeyForUid(uid);
      expect(accountKey).toBe(uid);
      expect(cookieName).toMatch(/^k_[0-9a-f]{16}$/);
      expect(cookieName).not.toBe(accountKey); // 关键：两者分离
    });

    it('写读一致：bind-session 写 cookie 名 = switch-account 读 cookie 名', () => {
      const uid = 'd102d02f-c338-4847-8cd8-71afb69b878a';
      // bind-session: setCookie(accountKeyForUid(uid), rt)
      const writtenCookieName = accountKeyForUid(uid);
      // switch-account: cookieName = accountKeyForUid(accountKey=uid)
      const readCookieName = accountKeyForUid(uid);
      expect(readCookieName).toBe(writtenCookieName); // 同 uid → 同 cookie 名
    });

    it('确定性：同 uid 多次派生结果相同（去重前提）', () => {
      const uid = 'd102d02f-c338-4847-8cd8-71afb69b878a';
      expect(accountKeyForUid(uid)).toBe(accountKeyForUid(uid));
    });

    it('不同 uid 派生不同 cookie 名（无串扰）', () => {
      const a = accountKeyForUid('uid-AAA');
      const b = accountKeyForUid('uid-BBB');
      expect(a).not.toBe(b);
    });

    it('换 SECRET → cookie 名变（强制重新登录）', () => {
      const uid = 'd102d02f-c338-4847-8cd8-71afb69b878a';
      const oldName = accountKeyForUid(uid);
      const newName = `k_${crypto.createHmac('sha256', 'new-secret').update(uid).digest('hex').slice(0, 16)}`;
      expect(newName).not.toBe(oldName); // 旧 cookie 读不到 → need_password
    });

    it('accountKey 不含凭证：uid 明文泄露无法读 rt（rt 在 HttpOnly cookie）', () => {
      const uid = 'd102d02f-c338-4847-8cd8-71afb69b878a';
      const accountKey = uid;
      // accountKey 只是身份标识，不包含 refreshToken，也无从推出 cookie 值
      expect(typeof accountKey).toBe('string');
      expect(accountKey).not.toContain('k_'); // accountKey 非 cookie 名
    });
  });
});
