/**
 * Session 管理测试
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import crypto from 'crypto';

// 测试 cookie 签名/验证逻辑
describe('session', () => {
  describe('cookie signing', () => {
    // 改用 framework/auth/cookie.js 真身，不再内联副本
    // （副本与真身已漂移，掩盖了 🔴-1 timingSafeEqual 崩溃，见 AUDIT-REPORT-2026-09-12.md）
    let signCookie, verifyCookie;

    beforeAll(async () => {
      ({ signCookie, verifyCookie } = await import('../framework/auth/cookie.js'));
    });

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

    it('畸形签名段返回 null 且不抛（🔴-1 回归）', () => {
      const payload = Buffer.from('sid:0').toString('base64url');
      const evil = payload + '.' + 'z'.repeat(64);
      expect(() => verifyCookie(evil)).not.toThrow();
      expect(verifyCookie(evil)).toBeNull();
    });
  });

  // 说明：这里曾有一个 `describe('session data structure')` 用例，通篇是
  // `const sessionData = {...}` + `expect(sessionData).toHaveProperty('userId')` ——
  // 断言的是自己刚写的字面量，把 `framework/auth/session.js` 改坏也照样全绿，
  // 于 2026-10-31 移除。会话数据结构真正的契约由 `session-flow.test.js`、
  // `framework/auth/auth-contract.test.js`、`framework/auth/session-security.test.js`
  // 驱动真身覆盖（创建 / 恢复 / 刷新 / 踢下线 全链路）。

  // accountKey 与凭证 cookie 名分离模型测试
  // accountKey = uid 明文（前端 localStorage key + 切账号发送值）
  // cookie 名 = accountKeyForUid(uid) = HMAC(uid, SECRET)（HttpOnly，后端派生）
  describe('accountKey 与凭证 cookie 名分离', () => {
    // ⚠️ 这里必须用真身 `framework/auth/cookie.js` 的 accountKeyForUid。
    // 旧版本在测试里用 crypto.createHmac 重新实现了一遍，于是派生算法、前缀、
    // 截断长度、SECRET 来源任何一处漂移都不会被这条断言发现（副本自证）。
    let accountKeyForUid;

    beforeAll(async () => {
      ({ accountKeyForUid } = await import('../framework/auth/cookie.js'));
    });

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

    it('cookie 名不可逆：不含 uid 明文（uid 泄露 ≠ 能算出 cookie 名）', () => {
      const uid = 'd102d02f-c338-4847-8cd8-71afb69b878a';
      expect(accountKeyForUid(uid)).not.toContain(uid);
    });

    it('非字符串 / 空 uid 直接抛 INVALID_PARAM（避免派生"undefined 用户"的凭证名）', () => {
      for (const bad of ['', null, undefined, 123]) {
        expect(() => accountKeyForUid(bad)).toThrow(/uid 参数无效/);
      }
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
