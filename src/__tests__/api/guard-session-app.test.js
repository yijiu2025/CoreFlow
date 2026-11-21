/**
 * 会话归属校验的判据边界
 *
 * 语义：凭据里的登录应用必须与"请求所属应用"一致，否则 401 引导登录
 * （而不是拿 A 的会话去访问 B、或干脆 403 让人以为是权限没配）。
 *
 * 两条边界必须成立，否则会误伤：
 *   · `requestAppId` 为 null —— 共享系统（/auth、/verify、/api/files），不该校验；
 *   · `credentialAppId` 为 null —— 尚未认证，交给后面的登录校验去 401。
 */
import { describe, it, expect } from '@jest/globals';
import { __test__isSessionAppMismatch as mismatch } from '../../api/guard.js';

describe('isSessionAppMismatch', () => {
  it('同一应用不算不一致', () => {
    expect(mismatch('console', 'console')).toBe(false);
  });

  it('不同应用算不一致（A 的会话访问 B）', () => {
    expect(mismatch('posecraft', 'console')).toBe(true);
    expect(mismatch('console', 'posecraft')).toBe(true);
  });

  it('请求所属应用未知（共享系统）→ 不校验', () => {
    expect(mismatch(null, 'console')).toBe(false);
    expect(mismatch(undefined, 'console')).toBe(false);
  });

  it('未认证（没有凭据应用）→ 不校验，交给登录校验', () => {
    expect(mismatch('console', null)).toBe(false);
    expect(mismatch('console', undefined)).toBe(false);
  });

  it('非字符串也能比（防御 JWT aud 为数组的极端情况）', () => {
    expect(mismatch(123, '123')).toBe(false);
  });
});
