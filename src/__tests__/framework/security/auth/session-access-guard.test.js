/**
 * 会话「应用级访问撤销」标记测试
 *
 * 被测的是真实模块（`framework/security/auth/session/session-access-guard.js`），
 * 只把 Redis store 换成内存假实现 —— 本机没有 Redis，而这段逻辑的正确性恰恰
 * 不能靠"有 Redis 时再看"来验证（它是补漏层，Redis 不可用才是它最该工作的场景）。
 *
 * 同时守一条**接线**：`session.js` 必须真的调用 `isAppAccessRevoked`。
 * 标记写得再对，没人读等于没有 —— 这类"写了但没接线"的漏洞静态断言最有效。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  markAppAccessRevoked,
  clearAppAccessRevoked,
  isAppAccessRevoked
} from '../../../../framework/security/auth/session/session-access-guard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * 内存版 store（形状与 redis-store 对齐：get/set(key, value, ttl)/del）
 *
 * @returns {object} 假 store
 */
function createFakeStore() {
  const data = new Map();
  return {
    data,
    /** 记录最后一次写入的 TTL，用于断言"带了过期时间" */
    lastTtl: null,
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async set(key, value, ttl) {
      this.lastTtl = ttl;
      data.set(key, value);
      return 'OK';
    },
    async del(key) {
      data.delete(key);
      return 1;
    }
  };
}

describe('应用级访问撤销标记', () => {
  test('写入后能读到（同一个用户同一个应用）', async () => {
    const store = createFakeStore();
    await markAppAccessRevoked(7, 'retroweb', 60, store);
    expect(await isAppAccessRevoked(7, 'retroweb', store)).toBe(true);
    // 必须带 TTL：不带就永远拦着，用户重新授权后也进不来
    expect(store.lastTtl).toBe(60);
  });

  test('不同用户 / 不同应用互不影响', async () => {
    const store = createFakeStore();
    await markAppAccessRevoked(7, 'retroweb', 60, store);
    expect(await isAppAccessRevoked(8, 'retroweb', store)).toBe(false);
    expect(await isAppAccessRevoked(7, 'console', store)).toBe(false);
  });

  test('撤销后可读回 false', async () => {
    const store = createFakeStore();
    await markAppAccessRevoked(7, 'retroweb', 60, store);
    await clearAppAccessRevoked(7, 'retroweb', store);
    expect(await isAppAccessRevoked(7, 'retroweb', store)).toBe(false);
  });

  test('缺参不写、不读（避免无意义的空键）', async () => {
    const store = createFakeStore();
    expect(await markAppAccessRevoked(null, 'retroweb', 60, store)).toBe(false);
    expect(await markAppAccessRevoked(7, '', 60, store)).toBe(false);
    expect(await isAppAccessRevoked(0, 'retroweb', store)).toBe(false);
    expect(store.data.size).toBe(0);
  });

  test('存储读失败时放行（fail-open），不把所有人挡在门外', async () => {
    const broken = {
      async get() {
        throw new Error('主 Redis 不可用');
      },
      async set() {
        throw new Error('主 Redis 不可用');
      },
      async del() {
        throw new Error('主 Redis 不可用');
      }
    };
    expect(await isAppAccessRevoked(7, 'retroweb', broken)).toBe(false);
    // 写失败返回 false 而不是抛异常：注销流程不能因为补漏层挂了而失败
    expect(await markAppAccessRevoked(7, 'retroweb', 60, broken)).toBe(false);
    await expect(clearAppAccessRevoked(7, 'retroweb', broken)).resolves.toBeUndefined();
  });

  test('session.js 真的调用了这个检查（防止"写了但没接线"）', () => {
    const src = fs.readFileSync(path.resolve(HERE, '../../../../framework/security/auth/session/session.js'), 'utf8');
    // 调用点必须带 appId 判空（没有 appId 的会话不属于任何应用，不该被拦）
    expect(src).toMatch(/isAppAccessRevoked\(raw\.userId,\s*raw\.appId\)/);
  });
});
