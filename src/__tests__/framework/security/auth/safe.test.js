/**
 * 二级认证（safe.js）行为测试
 *
 * 覆盖：认证窗开启/校验/关闭、剩余时间、fail-closed（读失败视为未开启）、
 * SECOND_AUTH_REQUIRED 错误形状、createSafePreHandler 守卫语义（未登录防御 + 窗内放行）。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ── 内存 store 桩（可注入故障模式）──
const makeStore = () => {
  const kv = new Map();
  let failMode = false;
  return {
    async get(k) {
      if (failMode) throw new Error('redis down');
      return kv.has(k) ? kv.get(k) : null;
    },
    async set(k, v) {
      if (failMode) throw new Error('redis down');
      kv.set(k, v);
    },
    async delete(k) {
      if (failMode) throw new Error('redis down');
      kv.delete(k);
    },
    setFailMode(v) {
      failMode = v;
    },
    reset() {
      kv.clear();
      failMode = false;
    }
  };
};
const storeCache = new Map();
const getStore = prefix => {
  if (!storeCache.has(prefix)) storeCache.set(prefix, makeStore());
  return storeCache.get(prefix);
};
const resetStores = () => {
  for (const s of storeCache.values()) s.reset();
};

jest.unstable_mockModule('../../../../framework/persistence/redis/index.js', () => ({ default: {}, getStore }));
jest.unstable_mockModule('../../../../framework/support/log/index.js', () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} })
}));

const safe = await import('../../../../framework/security/auth/security/safe.js');
const { removeAllAuthListeners } = await import('../../../../framework/security/auth/audit/events.js');

const UID = 7;
const SVC = 'change-password';

beforeEach(() => {
  resetStores();
  removeAllAuthListeners();
});

describe('openSafe / isSafe / checkSafe / closeSafe：认证窗生命周期', () => {
  test('未开启时 isSafe 为假，checkSafe 抛 SECOND_AUTH_REQUIRED', async () => {
    expect(await safe.isSafe(UID, SVC)).toBe(false);
    expect(await safe.getSafeTime(UID, SVC)).toBe(-1);
    const err = await safe.checkSafe(UID, SVC).catch(e => e);
    expect(err.code).toBe('SECOND_AUTH_REQUIRED');
    expect(err.statusCode).toBe(403);
    expect(err.details.service).toBe(SVC);
  });

  test('开启后窗内放行，剩余时间在窗口内', async () => {
    await safe.openSafe(UID, SVC, 60);
    expect(await safe.isSafe(UID, SVC)).toBe(true);
    const t = await safe.getSafeTime(UID, SVC);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(60);
    await expect(safe.checkSafe(UID, SVC)).resolves.toBeUndefined();
  });

  test('closeSafe 主动关闭后立即失效', async () => {
    await safe.openSafe(UID, SVC, 600);
    await safe.closeSafe(UID, SVC);
    expect(await safe.isSafe(UID, SVC)).toBe(false);
    await expect(safe.checkSafe(UID, SVC)).rejects.toThrow(/二次确认/);
  });

  test('fail-closed：Redis 故障时视为未开启（安全增强宁可误拒）', async () => {
    await safe.openSafe(UID, SVC, 600);
    storeCache.get('auth_safe').setFailMode(true);
    expect(await safe.isSafe(UID, SVC)).toBe(false);
    await expect(safe.checkSafe(UID, SVC)).rejects.toMatchObject({ code: 'SECOND_AUTH_REQUIRED' });
  });

  test('参数校验：service/userId/safeTime 非法抛错', async () => {
    await expect(safe.openSafe(UID, 'bad svc', 60)).rejects.toThrow('service');
    await expect(safe.openSafe(null, SVC, 60)).rejects.toThrow('userId');
    await expect(safe.openSafe(UID, SVC, 0)).rejects.toThrow('safeTime');
    await expect(safe.openSafe(UID, SVC, -5)).rejects.toThrow('safeTime');
  });
});

describe('createSafePreHandler：Fastify 守卫语义', () => {
  const makeRequest = user => ({ state: user ? { user } : {} });

  test('未登录（request.state.user 缺失）抛 SECOND_AUTH_REQUIRED，不触 Redis', async () => {
    const handler = safe.createSafePreHandler(SVC);
    await expect(handler(makeRequest(null), {})).rejects.toThrow('登录认证');
  });

  test('登录但未开启认证窗 → 抛 SECOND_AUTH_REQUIRED', async () => {
    const handler = safe.createSafePreHandler(SVC);
    await expect(handler(makeRequest({ userId: UID }), {})).rejects.toMatchObject({
      code: 'SECOND_AUTH_REQUIRED'
    });
  });

  test('登录且窗内 → 放行', async () => {
    await safe.openSafe(UID, SVC, 600);
    const handler = safe.createSafePreHandler(SVC);
    await expect(handler(makeRequest({ userId: UID }), {})).resolves.toBeUndefined();
  });

  test('service 维度在构造时即校验（坏维度快速失败）', () => {
    expect(() => safe.createSafePreHandler('bad svc!')).toThrow('service');
  });
});
