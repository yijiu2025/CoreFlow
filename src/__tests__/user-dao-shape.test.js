/**
 * 用户 DAO 返回形状契约（2026-11-01 改名手术后的护栏）
 *
 * 历史教训：user.dao.js 曾把适配对象的 id 劫持成 uid（`id: user.uid`，为对齐
 * JWT sub），数字主键被迫改名 numericId——同名字段两种语义，导致两次同型 bug：
 * - 6b52ad89（2026-08-13）：audit_logs.user_id(BIGINT) 写入 UUID 报错
 * - 2026-11-01：bearer-auth 把 uid 装进 userId / getPermissions，JWT 用户权限恒为空
 *
 * 本文件钉死目标形状（改名手术后的单一真相）：
 * - `id`  = 数字主键（模型原义）——数字列 FK、权限加载、封禁键
 * - `uid` = UUID 字符串——JWT sub、API 参数、日志
 * - `numericId` 永不回归（全 src 源码扫描）
 * - session-store / bearer-auth 两条认证路径的装配与此契约一致
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import { describe, test, expect, jest } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';

const FAKE_ID = 42;
const FAKE_UID = 'u-uuid-42';

const fakeUser = {
  id: FAKE_ID,
  uid: FAKE_UID,
  username: 'alice',
  email: 'alice@example.test',
  avatar: 'a.png',
  status: 1
};

jest.unstable_mockModule('../framework/persistence/db/index.js', () => ({
  getModel: name => {
    if (name === 'User') {
      return {
        findOne: async ({ where }) => {
          if (where.uid === FAKE_UID || where.email === fakeUser.email) return { ...fakeUser };
          return null;
        }
      };
    }
    if (name === 'UserIdentity') {
      return {
        findOne: async () => ({ user: { ...fakeUser }, credential: 'password-hash' })
      };
    }
    return null;
  }
}));

// user.dao.js 顶部 import verifyPassword（框架门面），mock 掉避免拉起整条 auth 链
jest.unstable_mockModule('../framework/security/auth/index.js', () => ({
  verifyPassword: async () => true
}));

const { default: UserDao } = await import('../app/oauth21/dao/user.dao.js');

describe('user.dao.js 返回形状契约', () => {
  const shapeCases = [
    ['findById', () => UserDao.findById(FAKE_UID)],
    ['findByEmail', () => UserDao.findByEmail(fakeUser.email)],
    ['findByUsername', () => UserDao.findByUsername('alice')]
  ];

  for (const [name, fn] of shapeCases) {
    test(`${name}：id 是数字主键、uid 是 UUID，二者语义永不错位`, async () => {
      const res = await fn();
      expect(res).not.toBeNull();
      expect(res.id).toBe(FAKE_ID);
      expect(typeof res.id === 'number' || typeof res.id === 'bigint').toBe(true);
      expect(res.uid).toBe(FAKE_UID);
      expect(typeof res.uid).toBe('string');
      // 同值双字段是 id 劫持的标志（历史上 id === uid 同时存在两份）
      expect(res.id).not.toBe(res.uid);
    });

    test(`${name}：numericId 不复存在`, async () => {
      const res = await fn();
      expect('numericId' in res).toBe(false);
    });
  }

  test('findByUsername 保留 credential（密码验证依赖）', async () => {
    const res = await UserDao.findByUsername('alice');
    expect(res.credential).toBe('password-hash');
  });
});

describe('形状契约的源码级护栏', () => {
  const srcRoot = new URL('../', import.meta.url);

  const listJs = dir => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // ⚠️ 尾部 `/` **只能给目录**：给文件也拼斜杠会得到 `.../iam.js/`，
      // Windows 容忍（readFileSync 照读），Linux 直接 ENOTDIR ——
      // 本仓 CI 因此从 2026-11-01 起连红两天，本地却全绿（平台差异盲区）。
      const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue; // 测试 fixtures 允许提及历史字段名
        out.push(...listJs(full));
      } else if (entry.name.endsWith('.js')) {
        out.push(full);
      }
    }
    return out;
  };

  test('全 src 不再出现 numericId（防止历史命名回归）', () => {
    const files = listJs(srcRoot);
    // 平台无关护栏：文件 URL 不得以 `/` 结尾。Windows 会把 `x.js/` 当文件正常读取，
    // Linux 直接 ENOTDIR —— 没有这条断言，同一份代码在本地绿、CI 红（已发生两天）。
    expect(files.filter(f => f.pathname.endsWith('/')).map(f => f.pathname)).toEqual([]);

    const offenders = files.filter(f => /numericId/.test(readFileSync(f, 'utf8'))).map(f => f.pathname);
    expect(offenders).toEqual([]);
  });

  test('session-store 用户缓存形状与 DAO 契约一致（id 数字 / uid UUID）', () => {
    const src = readFileSync(new URL('framework/security/auth/session/session-store.js', srcRoot), 'utf8');
    expect(src).toMatch(/^\s+id: user\.id,/m);
    expect(src).toMatch(/^\s+uid: user\.uid,/m);
    // 锚定行首，避免匹配到 "uid: user.uid" 的子串
    expect(src).not.toMatch(/^\s+id: user\.uid\b/m);
  });

  test('bearer-auth 装配：sub/uid 取 uid 字符串，userId 取数字主键', () => {
    const src = readFileSync(new URL('framework/security/auth/bearer-auth.js', srcRoot), 'utf8');
    expect(src).toMatch(/sub: userData\.uid/);
    expect(src).toMatch(/uid: userData\.uid/);
    expect(src).toMatch(/userId: userData\.id/);
    expect(src).not.toMatch(/sub: userData\.id/);
  });
});
