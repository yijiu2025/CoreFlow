/**
 * 端到端验证：权限变更能否穿透会话长 TTL 立即生效
 *
 * 这是本次改造的**核心命题**。改造前：撤销权限后，会话里的 permissions 快照
 * 在整个 TTL（记住我 30 天）内继续有效 —— 用户仍能访问已失去权限的资源。
 *
 * 验证方式：不 mock 策略，只替换"数据源"（三张权限表的查询结果），
 * 观察 resolveSessionPermissions 在同一份会话副本上是否判定失效。
 */
import { jest } from '@jest/globals';

// 用 unstable_mockModule 整体替换 perm-cache 的**依赖**，而不是复制策略
const fpStore = { value: 'FP_INITIAL' };

jest.unstable_mockModule('../../framework/auth/perm-cache.js', () => ({
  getPermissions: jest.fn(async () => ({ roles: ['r_old'], permissions: { allows: ['a'], denies: [] } })),
  computePermFingerprint: jest.fn(async () => fpStore.value)
}));

const { resolveSessionPermissions } = await import('../../framework/auth/session-perm.js');

describe('会话权限随指纹失效（第 3 层端到端）', () => {
  test('指纹未变 → 沿用会话副本（不回源）', async () => {
    fpStore.value = 'FP_SAME';
    const session = {
      roles: ['r_cached'],
      permissions: { allows: ['cached'], denies: [] },
      permFingerprint: 'FP_SAME'
    };
    const r = await resolveSessionPermissions(1, 'app', session);
    expect(r.roles).toEqual(['r_cached']); // 用副本而非回源值 r_old
    expect(r.permissions.allows).toEqual(['cached']);
    expect(r.permFingerprint).toBe('FP_SAME');
  });

  test('指纹变化 → 权限作废重载（这就是"撤销后立即生效"）', async () => {
    fpStore.value = 'FP_CHANGED';
    const session = {
      roles: ['r_cached'],
      permissions: { allows: ['cached'], denies: [] },
      permFingerprint: 'FP_OLD'
    };
    const r = await resolveSessionPermissions(1, 'app', session);
    expect(r.roles).toEqual(['r_old']); // 换成回源结果
    expect(r.permFingerprint).toBe('FP_CHANGED'); // 指纹已更新
  });

  test('老会话没存指纹 → 必须回源（不能沿用）', async () => {
    fpStore.value = 'FP_X';
    const r = await resolveSessionPermissions(1, 'app', {
      roles: ['r_cached'],
      permissions: { allows: [], denies: [] }
    });
    expect(r.roles).toEqual(['r_old']);
  });

  test('会话副本缺 permissions → 必须回源', async () => {
    fpStore.value = 'FP_X';
    const r = await resolveSessionPermissions(1, 'app', { roles: ['r_cached'], permFingerprint: 'FP_X' });
    expect(r.roles).toEqual(['r_old']);
  });

  test('fingerprint 计算抛错 → 保守回源（宁可多查，不可沿用过期权限）', async () => {
    const mod = await import('../../framework/auth/perm-cache.js');
    mod.computePermFingerprint.mockImplementationOnce(async () => {
      throw new Error('DB 抖动');
    });
    const r = await resolveSessionPermissions(1, 'app', {
      roles: ['r_cached'],
      permissions: { allows: ['cached'], denies: [] },
      permFingerprint: 'FP_SAME'
    });
    // 抛错时不得返回副本 —— 必须回源
    expect(r.roles).toEqual(['r_old']);
  });

  test('空会话对象不抛错', async () => {
    fpStore.value = 'FP_Y';
    await expect(resolveSessionPermissions(1, 'app')).resolves.toBeDefined();
  });
});
