/**
 * 会话权限解析流程（真实模块驱动）
 *
 * 旧版本用 `[{ step: '1', action: 'Redis 查找 session' }]` 这类流程数组自证，
 * 没有任何生产代码参与。
 *
 * 本版驱动真实的 `resolveSessionPermissions`（第 3 层防御：权限指纹在会话路径的落地点），
 * 只把 perm-cache 换成可控实现，断言四种真实决策：
 * - 指纹一致 → 沿用会话副本（不回源）
 * - 指纹不一致 → 权限作废重载
 * - 会话没存指纹（老会话）→ 直接回源
 * - 指纹计算失败 → **保守回源**（宁可多查一次库，不沿用可能过期的权限）
 *
 * 这些正是"管理员撤销权限后，用户还能不能继续用旧权限"的判据。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const cache = {
  permissions: { allows: ['user:profile:read'], denies: [] },
  roles: ['user_normal'],
  fingerprint: 'fp-1',
  fingerprintError: null,
  getPermissionsCalls: 0
};

jest.unstable_mockModule('../framework/auth/perm-cache.js', () => ({
  getPermissions: async () => {
    cache.getPermissionsCalls++;
    return { roles: cache.roles, permissions: cache.permissions };
  },
  computePermFingerprint: async () => {
    if (cache.fingerprintError) throw cache.fingerprintError;
    return cache.fingerprint;
  }
}));

const { resolveSessionPermissions } = await import('../framework/auth/session-perm.js');

beforeEach(() => {
  cache.permissions = { allows: ['user:profile:read'], denies: [] };
  cache.roles = ['user_normal'];
  cache.fingerprint = 'fp-1';
  cache.fingerprintError = null;
  cache.getPermissionsCalls = 0;
});

/** 已登录会话副本 */
function sessionWith(fingerprint) {
  return {
    roles: ['user_normal'],
    permissions: { allows: ['user:profile:read'], denies: [] },
    permFingerprint: fingerprint
  };
}

describe('resolveSessionPermissions', () => {
  it('指纹一致：沿用会话副本，不回源查询', async () => {
    const session = sessionWith('fp-1');
    const resolved = await resolveSessionPermissions(1, 'firewall', session);

    expect(cache.getPermissionsCalls).toBe(0);
    expect(resolved.roles).toBe(session.roles);
    expect(resolved.permissions).toBe(session.permissions);
    expect(resolved.permFingerprint).toBe('fp-1');
  });

  it('指纹不一致：权限作废重载，返回新权限与新指纹', async () => {
    cache.permissions = { allows: [], denies: ['user:profile:read'] };
    cache.roles = ['user_limited'];
    cache.fingerprint = 'fp-2';

    const resolved = await resolveSessionPermissions(2, 'firewall', sessionWith('fp-1'));

    expect(cache.getPermissionsCalls).toBe(1);
    expect(resolved.roles).toEqual(['user_limited']);
    expect(resolved.permissions).toEqual({ allows: [], denies: ['user:profile:read'] });
    expect(resolved.permFingerprint).toBe('fp-2');
  });

  it('会话没存指纹（老会话/字段被裁）：无法判断新鲜度，直接回源', async () => {
    const legacy = { roles: ['user_normal'], permissions: { allows: [], denies: [] } };
    const resolved = await resolveSessionPermissions(3, 'firewall', legacy);

    expect(cache.getPermissionsCalls).toBe(1);
    expect(resolved.permFingerprint).toBe('fp-1');
  });

  it('会话缺 roles/permissions：同样回源', async () => {
    const resolved = await resolveSessionPermissions(4, 'firewall', { permFingerprint: 'fp-1' });
    expect(cache.getPermissionsCalls).toBe(1);
    expect(resolved.roles).toEqual(['user_normal']);
  });

  it('指纹计算失败：保守回源，不沿用旧权限', async () => {
    cache.permissions = { allows: ['user:profile:write'], denies: [] };
    cache.fingerprintError = new Error('DB 不可用');

    const resolved = await resolveSessionPermissions(5, 'firewall', sessionWith('fp-1'));

    expect(cache.getPermissionsCalls).toBe(1);
    expect(resolved.permissions).toEqual({ allows: ['user:profile:write'], denies: [] });
    // 取不到新指纹 → 保留旧指纹，下次恢复仍判"不一致"继续回源（保守方向）
    expect(resolved.permFingerprint).toBe('fp-1');
  });

  it('空 session 参数（未登录恢复场景）也能安全回源', async () => {
    const resolved = await resolveSessionPermissions(6, 'GLOBAL');
    expect(cache.getPermissionsCalls).toBe(1);
    expect(resolved.roles).toEqual(['user_normal']);
    expect(resolved.permFingerprint).toBe('fp-1');
  });
});
