/**
 * 按应用分名的 sid cookie
 *
 * 背景：cookie 只按 host 划分、**端口不参与**（RFC 6265）。同 host 多应用部署时
 * （本地 localhost:5173 / :5174），一个裸 `sid` 会被互相覆盖：登录 B 顶掉 A。
 * `session.cookieScopedByApp` 打开后，每个应用各用 `sid_<app>`，互不干扰。
 *
 * 关闭时**必须逐字节维持旧行为**（恒为 `sid`），否则所有人升级即掉线。
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

let scoped = false;
jest.unstable_mockModule('../../../../framework/security/auth/session/session-config.js', () => ({
  authSessionConfig: () => ({ session: { cookieScopedByApp: scoped } })
}));

const { sidCookieName, sidCookieCandidates } = await import('../../../../framework/security/auth/context/cookie.js');

beforeEach(() => {
  scoped = false;
});

describe('sidCookieName：关闭分名时保持旧行为', () => {
  it('恒为 sid（与升级前逐字节一致）', () => {
    expect(sidCookieName('console')).toBe('sid');
    expect(sidCookieCandidates('console')).toEqual(['sid']);
  });
});

describe('sidCookieName：开启分名后按应用区分', () => {
  it('sid_<app>，两个应用不同名因此可并存', () => {
    scoped = true;
    expect(sidCookieName('console')).toBe('sid_console');
    expect(sidCookieName('posecraft')).toBe('sid_posecraft');
  });

  it('大小写与非法字符归一（cookie 名只允许有限字符集）', () => {
    scoped = true;
    expect(sidCookieName('PoseCraft')).toBe('sid_posecraft');
    expect(sidCookieName('a.b c')).toBe('sid_abc');
  });

  it('空值 / GLOBAL 回落裸 sid（GLOBAL 不是登录应用）', () => {
    scoped = true;
    expect(sidCookieName('')).toBe('sid');
    expect(sidCookieName('GLOBAL')).toBe('sid');
  });

  it('候选顺序：先专属名，再回落裸 sid（迁移期旧 cookie 仍可用）', () => {
    scoped = true;
    expect(sidCookieCandidates('console')).toEqual(['sid_console', 'sid']);
  });
});
