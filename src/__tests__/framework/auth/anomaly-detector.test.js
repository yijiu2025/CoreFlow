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

/** 按模型名可配置的 DB 桩（各 describe 按需覆盖；未注册的模型名会抛 TypeError，与真实一致） */
const modelStubs = {};

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({
  default: {},
  getStore: () => storeStub
}));

jest.unstable_mockModule('../../../framework/db/index.js', () => ({
  default: {},
  // 🔴 与真实 getModel 行为对齐（framework/db/index.js：未命中抛 TypeError 而非返回 null）
  getModel: name => {
    const model = modelStubs[name];
    if (!model) {
      throw new TypeError(`getModel: 模型 "${name}" 不存在`);
    }
    return model;
  }
}));

const {
  detectSessionRisk,
  confirmVerifyToken,
  isHighRiskRequest,
  registerRiskVerifyUrl,
  detectLoginEnvironmentAnomaly,
  detectLoginAnomaly
} = await import('../../../framework/auth/risk/anomaly-detector.js');
const { computeDeviceFingerprint } = await import('../../../framework/auth/device/device.js');

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

describe('detectSessionRisk：设备 ID 丢失/变更（与指纹变更同级）', () => {
  test('设备 ID 丢失（客户端 header+cookie 均无）→ warn + device_id_missing + 签发验证 token', async () => {
    const result = await detectSessionRisk({ ...BASE, deviceIdMismatch: true, deviceIdMissing: true });

    expect(result.level).toBe('warn');
    expect(result.reasons).toContain('device_id_missing');
    expect(result.verify.url).toBe('/auth/v1/verify-challenge');
    expect(result.verify.header).toBe('x-verify-token');
    expect([...storeMap.keys()].some(k => k.startsWith('vtoken:'))).toBe(true);
  });

  test('设备 ID 变更（上报 ID 与登录链不一致，被替换/恢复）→ warn + device_id_changed', async () => {
    const result = await detectSessionRisk({ ...BASE, deviceIdMismatch: true });

    expect(result.level).toBe('warn');
    expect(result.reasons).toContain('device_id_changed');
    expect(result.verify).toBeDefined();
  });

  test('设备 ID 丢失但基准缺失（旧 session）→ 仍 warn（独立于指纹基准）', async () => {
    const result = await detectSessionRisk({
      ...BASE,
      baselineFingerprint: undefined,
      deviceIdMismatch: true,
      deviceIdMissing: true
    });
    expect(result.level).toBe('warn');
    expect(result.reasons).toContain('device_id_missing');
  });

  test('设备 ID 丢失 + 指纹变 → reasons 同时包含两项', async () => {
    const result = await detectSessionRisk({
      ...BASE,
      fingerprint: 'fp-b',
      deviceIdMismatch: true,
      deviceIdMissing: true
    });
    expect(result.level).toBe('warn');
    expect(result.reasons).toContain('fingerprint_changed');
    expect(result.reasons).toContain('device_id_missing');
  });

  test('已验证标记命中 → 设备 mismatch 也直接 safe（免验窗内不重复弹）', async () => {
    storeMap.set(`verified:${BASE.userId}:${BASE.deviceId}`, { at: Date.now() });
    const result = await detectSessionRisk({ ...BASE, deviceIdMismatch: true, deviceIdMissing: true });
    expect(result.level).toBe('safe');
    expect(result.reasons).toEqual(['already_verified']);
  });

  test('客户端上报一致（无 mismatch）→ 走原有指纹逻辑，safe', async () => {
    const result = await detectSessionRisk({ ...BASE, deviceIdMismatch: false, deviceIdMissing: false });
    expect(result.level).toBe('safe');
  });
});

describe('confirmVerifyToken 一次性消费', () => {
  test('warn 签发的 token 验证成功 → 写免验标记 + 二次验证失败（一次性）', async () => {
    const risk = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    const token = risk.verify.token;

    expect(await confirmVerifyToken(token, { userId: BASE.userId })).toBe(true);
    // 免验标记已写入
    expect(storeMap.has(`verified:${BASE.userId}:${BASE.deviceId}`)).toBe(true);
    // 二次消费同 token → false（一次性）
    expect(await confirmVerifyToken(token, { userId: BASE.userId })).toBe(false);
    // 后续风险检测直接 safe
    const after = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    expect(after.level).toBe('safe');
  });

  test('无身份上下文 → 拒绝（fail-closed，不给跳过归属校验的口子）', async () => {
    const risk = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    expect(await confirmVerifyToken(risk.verify.token)).toBe(false);
    expect(await confirmVerifyToken(risk.verify.token, {})).toBe(false);
    // token 未被消费，原主仍可正常验证
    expect(await confirmVerifyToken(risk.verify.token, { userId: BASE.userId })).toBe(true);
  });

  test('跨用户消费 → false（归属校验）', async () => {
    const risk = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    expect(await confirmVerifyToken(risk.verify.token, { userId: 999 })).toBe(false);
  });

  test('非法 / 不存在的 token → false', async () => {
    expect(await confirmVerifyToken('1.WEB-xxx.notexist', { userId: 1 })).toBe(false);
    expect(await confirmVerifyToken('', { userId: 1 })).toBe(false);
  });

  test('验证标记按 deviceId 维度隔离：换设备验证不互认', async () => {
    const risk = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    await confirmVerifyToken(risk.verify.token, { userId: BASE.userId });

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

  test('路由声明 riskExempt（config 标志）→ 写操作不拦，防死锁', () => {
    // 🔴 单一事实源 = registerSecureRoute({ riskExempt: true }) 写进 routeOptions.config，
    // 判定与 URL 前缀无关 —— 前缀改了、路由搬家都不影响
    const exempt = {
      method: 'POST',
      url: '/any/prefix/auth/v1/verify-challenge',
      routeOptions: { config: { riskExempt: true } }
    };
    expect(isHighRiskRequest(exempt)).toBe(false);
    // query string / 子路径同样由标志位决定，不再依赖路径匹配
    const subPath = {
      method: 'DELETE',
      url: '/auth/v1/saved-accounts/revoke?x=1',
      routeOptions: { config: { riskExempt: true } }
    };
    expect(isHighRiskRequest(subPath)).toBe(false);
  });

  test('未声明路由（含 404）写操作照拦（fail-closed）', () => {
    // 曾硬编码 '/auth/v1/logout' 豁免 —— 该路径根本不存在（真实登出在 /oauth2.1），
    // 现在无声明 = 无豁免，杜绝"清单腐烂出死锁"整类问题
    expect(isHighRiskRequest({ method: 'POST', url: '/oauth2.1/v1/logout' })).toBe(true);
    expect(isHighRiskRequest({ method: 'POST', url: '/auth/v1/whatever' })).toBe(true);
  });

  test('registerRiskVerifyUrl：验证端点注册时回填真实 URL 作为兜底', async () => {
    registerRiskVerifyUrl('/oauth2.1/v1/verify-challenge');
    const result = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' }); // 不传 verifyUrl → 用回填值
    expect(result.verify.url).toBe('/oauth2.1/v1/verify-challenge');
    // 无效 URL 拒绝回填
    registerRiskVerifyUrl('not-a-url');
    const r2 = await detectSessionRisk({ ...BASE, fingerprint: 'fp-b' });
    expect(r2.verify.url).toBe('/oauth2.1/v1/verify-challenge');
    // 恢复默认，避免污染其他用例
    registerRiskVerifyUrl('/auth/v1/verify-challenge');
  });
});

describe('detectLoginEnvironmentAnomaly 多设备/多 app 判定', () => {
  const UID = 'uid-1';
  const UA = 'Mozilla/5.0 (Windows NT 10.0)';
  /** 两台设备的指纹（deviceId 不同 → 指纹不同） */
  const FP_A = computeDeviceFingerprint({ deviceId: 'WEB-DeviceAAAA-aaaa1', userAgent: UA, uid: UID });
  const FP_B = computeDeviceFingerprint({ deviceId: 'WEB-DeviceBBBB-bbbb2', userAgent: UA, uid: UID });

  beforeEach(() => {
    delete modelStubs.SessionToken;
  });

  test('任一已知设备指纹匹配 → safe（即使全局最新行来自另一台设备）', async () => {
    // 设备 B 最近活跃（latest=B），本次从设备 A 登录——旧逻辑会误 warn
    modelStubs.SessionToken = {
      findOne: jest.fn(async ({ where }) => {
        if (where.device_fingerprint === FP_A) {
          return { device_id: 'WEB-DeviceAAAA-aaaa1', device_fingerprint: FP_A, ip: '1.1.1.1' };
        }
        return { device_id: 'WEB-DeviceBBBB-bbbb2', device_fingerprint: FP_B, ip: '2.2.2.2' };
      })
    };

    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-DeviceAAAA-aaaa1',
      userAgent: UA,
      ip: '1.1.1.1'
    });
    expect(result.status).toBe('safe');
    expect(result.baseline.device_id).toBe('WEB-DeviceAAAA-aaaa1');
  });

  test('指纹无匹配但有历史行 → warn（全新设备/盗号）', async () => {
    modelStubs.SessionToken = {
      findOne: jest.fn(async ({ where }) =>
        where.device_fingerprint ? null : { device_fingerprint: FP_B, ip: '2.2.2.2' }
      )
    };

    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-NewDeviceCC-cccc3',
      userAgent: UA,
      ip: '3.3.3.3'
    });
    expect(result.status).toBe('warn');
    expect(result.reason).toBe('登录设备/环境与上次不一致');
  });

  test('无任何历史行 → info 首次登录', async () => {
    modelStubs.SessionToken = { findOne: jest.fn(async () => null) };

    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-FirstDeviceD-dddd4',
      userAgent: UA,
      ip: '4.4.4.4'
    });
    expect(result.status).toBe('info');
    expect(result.reason).toBe('无历史基准，首次登录');
  });

  test('已知设备但 IP 漂移 → info（与该设备自己的 IP 比，不拦）', async () => {
    modelStubs.SessionToken = {
      findOne: jest.fn(async ({ where }) => ({ device_fingerprint: where.device_fingerprint, ip: '9.9.9.9' }))
    };

    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-DeviceAAAA-aaaa1',
      userAgent: UA,
      ip: '8.8.8.8' // 与基准行 IP 不同（换网络）
    });
    expect(result.status).toBe('info');
    expect(result.reason).toContain('IP 变化');
  });

  test('基准行无指纹（旧 session）→ info 降级', async () => {
    modelStubs.SessionToken = {
      findOne: jest.fn(async ({ where }) => (where.device_fingerprint ? null : { device_fingerprint: null }))
    };

    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-DeviceAAAA-aaaa1',
      userAgent: UA,
      ip: '1.1.1.1'
    });
    expect(result.status).toBe('info');
    expect(result.reason).toBe('基准指纹缺失');
  });

  test('SessionToken 模型不可用（getModel 抛 TypeError）→ info 降级放行，不炸登录主流程', async () => {
    // beforeEach 已 delete modelStubs.SessionToken：桩现在与真实 getModel 一致（未注册即抛）
    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-DeviceAAAA-aaaa1',
      userAgent: UA,
      ip: '1.1.1.1'
    });
    expect(result.status).toBe('info');
    expect(result.reason).toContain('基准存储不可用');
  });

  test('指纹材料与 createSession 基准严格一致（防 platformHint 混入回归）', async () => {
    // createSession 存基准用的材料是 `deviceId|uid|UA|`（platformHint 硬编码 ''）。
    // 这里手工按同一材料拼指纹作 DB 行，不与被测函数共用计算入口——
    // 若有人给 detectLoginEnvironmentAnomaly 的指纹掺入 platformHint 等字段，
    // 材料漂移 → 匹配失败 → 本用例立即失败（曾有 'web' 混入导致每次登录误弹验证）。
    const crypto = await import('node:crypto');
    const storedFp = crypto
      .createHash('sha256')
      .update(`WEB-DeviceAAAA-aaaa1|${UID}|${UA}|`)
      .digest('hex')
      .slice(0, 32);
    modelStubs.SessionToken = {
      findOne: jest.fn(async ({ where }) =>
        where.device_fingerprint === storedFp ? { device_fingerprint: storedFp, ip: '1.1.1.1' } : null
      )
    };

    const result = await detectLoginEnvironmentAnomaly({
      userId: 1,
      uid: UID,
      deviceId: 'WEB-DeviceAAAA-aaaa1',
      userAgent: UA,
      ip: '1.1.1.1'
    });
    expect(result.status).toBe('safe');
  });
});

describe('detectLoginAnomaly 暴力破解锁定（DB 降级路径）', () => {
  const PARAMS = { email: 'a@b.c', ip: '1.2.3.4' };

  beforeEach(() => {
    delete modelStubs.SessionLog;
    storeMap.clear();
  });

  test('SessionLog 模型不可用 → 计数降级 0，登录放行（fail-open 但不炸）', async () => {
    const result = await detectLoginAnomaly(PARAMS);
    expect(result.status).toBe('safe');
  });

  test('IP 失败次数超阈值 → block + 写入锁定标记（当次即锁，不等下次）', async () => {
    modelStubs.SessionLog = { count: async () => 10 }; // ≥ maxFailuresPerIp
    const result = await detectLoginAnomaly(PARAMS);
    expect(result.status).toBe('block');
    expect(result.reason).toContain('临时锁定');
    expect(storeMap.has('lockout:ip:1.2.3.4')).toBe(true);
    expect(storeMap.has('lockout:email:a@b.c')).toBe(true);
  });

  test('锁定期内命中锁定标记 → 直接 block，不打 DB（先查锁短路，撞库不放大成 COUNT）', async () => {
    storeMap.set('lockout:email:a@b.c', '1', 1800);
    let countCalls = 0;
    modelStubs.SessionLog = {
      count: async () => {
        countCalls += 1;
        return 99;
      }
    };
    const result = await detectLoginAnomaly(PARAMS);
    expect(result.status).toBe('block');
    expect(result.reason).toContain('已被锁定');
    expect(countCalls).toBe(0); // 🔴 原实现锁定期内每次尝试仍打两次 DB COUNT
  });

  test('email 缺失 → 跳过账号维度，不产生 lockout:email:undefined 垃圾键', async () => {
    modelStubs.SessionLog = { count: async () => 99 };
    const result = await detectLoginAnomaly({ ip: '5.6.7.8' });
    expect(result.status).toBe('block'); // 仍按 IP 维度锁
    expect(storeMap.has('lockout:email:undefined')).toBe(false);
    expect(storeMap.has('lockout:ip:5.6.7.8')).toBe(true);
  });
});
