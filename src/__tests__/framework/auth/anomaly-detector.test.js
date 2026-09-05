/**
 * 会话风险检测单元测试（anomaly-detector）
 *
 * mock redis store（Map 实现），覆盖：detectSessionRisk 分级判定
 * （safe/info/warn + verified 免验短路）、验证 token 一次性消费、
 * 高风险请求判定（含豁免路径）。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

/** Map 后端的 store 桩（替代 redis getStore） */
const storeMap = new Map();
const storeStub = {
  async get(key) {
    return storeMap.has(key) ? storeMap.get(key) : null;
  },
  async set(key, value) {
    storeMap.set(key, value);
  },
  async delete(key) {
    storeMap.delete(key);
  }
};

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({
  default: {},
  getStore: () => storeStub
}));

jest.unstable_mockModule('../../../framework/db/index.js', () => ({
  default: {},
  getModel: () => ({ count: async () => 0, findOne: async () => null })
}));

const { detectSessionRisk, confirmVerifyToken, isHighRiskRequest } =
  await import('../../../framework/auth/anomaly-detector.js');

const BASE = {
  userId: 1,
  deviceId: 'WEB-AbCdEfGhIjK-Ab3dE9',
  ip: '1.2.3.4',
  fingerprint: 'fp-a',
  baselineFingerprint: 'fp-a',
  baselineIp: '1.2.3.4'
};

beforeEach(() => {
  storeMap.clear();
});

describe('detectSessionRisk 分级判定', () => {
  test('userId / deviceId 缺失 → info（不拦）', async () => {
    const result = await detectSessionRisk({ userId: null, deviceId: '' });
    expect(result.level).toBe('info');
    expect(result.reasons).toContain('missing_user_or_device');
  });

  test('基准缺失（旧 session 无指纹字段）→ info 降级放行', async () => {
    const result = await detectSessionRisk({ ...BASE, baselineFingerprint: undefined });
    expect(result.level).toBe('info');
    expect(result.reasons).toContain('no_baseline');
  });

  test('指纹与 IP 都没变 → safe', async () => {
    const result = await detectSessionRisk(BASE);
    expect(result.level).toBe('safe');
  });

  test('指纹变 → warn + 签发验证 token（存 Redis 供 verify-challenge 消费）', async () => {
    const result = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b', verifyUrl: '/auth/v1/verify-challenge' });

    expect(result.level).toBe('warn');
    expect(result.reasons).toContain('fingerprint_changed');
    expect(result.verify.url).toBe('/auth/v1/verify-challenge');
    expect(result.verify.header).toBe('x-verify-token');
    // token 已写入 store（vtoken: 前缀）
    expect([...storeMap.keys()].some(k => k.startsWith('vtoken:'))).toBe(true);
  });

  test('指纹变 + IP 变 → warn 且 reasons 同时包含两项', async () => {
    const result = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b', ip: '5.6.7.8' });
    expect(result.level).toBe('warn');
    expect(result.reasons).toContain('fingerprint_changed');
    expect(result.reasons).toContain('ip_changed');
  });

  test('指纹不变仅 IP 变（梯子）→ info 不拦', async () => {
    const result = await detectSessionRisk({ ...BASE, ip: '5.6.7.8' });
    expect(result.level).toBe('info');
    expect(result.reasons).toEqual(['ip_changed']);
    expect(result.verify).toBeUndefined();
  });

  test('verified 免验标记命中 → 直接 safe（不重复弹验证）', async () => {
    storeMap.set(`verified:${BASE.userId}:${BASE.deviceId}`, { at: Date.now() });
    const result = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    expect(result.level).toBe('safe');
    expect(result.reasons).toEqual(['already_verified']);
  });
});

describe('confirmVerifyToken 一次性消费', () => {
  test('warn 签发的 token 验证成功 → 写免验标记 + 二次验证失败（一次性）', async () => {
    const risk = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    const token = risk.verify.token;

    expect(await confirmVerifyToken(token)).toBe(true);
    // 免验标记已写入
    expect(storeMap.has(`verified:${BASE.userId}:${BASE.deviceId}`)).toBe(true);
    // 二次消费同 token → false（一次性）
    expect(await confirmVerifyToken(token)).toBe(false);
    // 后续风险检测直接 safe
    const after = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    expect(after.level).toBe('safe');
  });

  test('非法 / 不存在的 token → false', async () => {
    expect(await confirmVerifyToken('1.WEB-xxx.notexist')).toBe(false);
    expect(await confirmVerifyToken('')).toBe(false);
  });

  test('验证标记按 deviceId 维度隔离：换设备验证不互认', async () => {
    const risk = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    await confirmVerifyToken(risk.verify.token);

    const otherDevice = { ...BASE, deviceId: 'IOS-AbCdEfGhIjK-Xy9Zw1', fingerprint: 'fp-b' };
    const result = await detectSessionRisk(otherDevice);
    expect(result.level).toBe('warn');
  });
});

describe('isHighRiskRequest 高风险判定', () => {
  test('GET / HEAD / OPTIONS 非写操作 → false', () => {
    expect(isHighRiskRequest({ method: 'GET', url: '/user/v1/profile' })).toBe(false);
    expect(isHighRiskRequest({ method: 'HEAD', url: '/x' })).toBe(false);
    expect(isHighRiskRequest({ method: 'OPTIONS', url: '/x' })).toBe(false);
  });

  test('非 GET 写操作 → true', () => {
    expect(isHighRiskRequest({ method: 'POST', url: '/user/v1/settings' })).toBe(true);
    expect(isHighRiskRequest({ method: 'DELETE', url: '/work/1' })).toBe(true);
  });

  test('豁免路径（退出/切换/验证类）写操作也不拦，防死锁', () => {
    expect(isHighRiskRequest({ method: 'POST', url: '/auth/v1/logout' })).toBe(false);
    expect(isHighRiskRequest({ method: 'POST', url: '/auth/v1/switch-account' })).toBe(false);
    expect(isHighRiskRequest({ method: 'POST', url: '/auth/v1/verify-challenge?code=x' })).toBe(false);
    expect(isHighRiskRequest({ method: 'POST', url: '/auth/v1/bind-session' })).toBe(false);
  });
});
