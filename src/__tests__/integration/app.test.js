/**
 * 认证插件端到端（真实插件 + 真实 Fastify inject）
 *
 * 旧版本在测试里手写了一个 `buildTestApp()`：自己 decorateReply、自己定义
 * `/api/public` 假路由、自己写 auth 钩子 —— 断言的是这份副本，生产插件删掉也全绿。
 *
 * 本版注册**真实** `framework/security/auth/index.js`，只把外部依赖（session/jwt/风险检测/
 * 用户查询/Redis）换成可控实现，用 inject 发真实请求，断言：
 * - 无 cookie 时 request.state.user 不被写入（不能凭空白放行身份）
 * - 有效 sid 时 state.user 的字段映射（sub=uid、appId、roles、sessionId）
 * - 无效/已失效 sid 不产生身份
 * - 高风险设备变更 + 写操作 → 403 且业务 handler 不执行；读操作放行并注入 __risk__
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

process.env.JWT_ENABLED = 'false';

/** 可控的认证上游状态 */
const state = {
  session: null,
  risk: { level: 'safe' },
  verified: false,
  handlerCalls: 0
};

// 2026-11-01 auth 拆子目录后业务代码走 index.js 门面，门面 re-export 各模块的
// 完整导出面 ⇒ mock 必须提供每个被 re-export 的绑定（本套件不能 requireActual：
// session.js 依赖图含异步 mock 的 perm-cache，require 链会炸），未用到的名字给空桩
jest.unstable_mockModule('../../framework/security/auth/session/session.js', () => ({
  createSession: jest.fn(),
  getSession: async () => state.session,
  refreshSession: jest.fn(),
  switchSessionByRefreshToken: jest.fn(),
  destroySession: jest.fn(),
  revokeRememberMe: jest.fn(),
  updateRememberMe: jest.fn(),
  updateSessionBaseline: jest.fn(),
  getSessionTokenDevice: async () => null
}));

jest.unstable_mockModule('../../framework/security/jwt/index.js', () => ({
  sign: jest.fn(),
  verify: async () => null
}));

jest.unstable_mockModule('../../shared/user-dao.js', () => ({
  findUserByUid: async () => null
}));

jest.unstable_mockModule('../../framework/security/auth/permission/perm-cache.js', () => ({
  PERM_NAMESPACE: 'auth:perm',
  PERM_TTL: 30,
  buildPermKey: jest.fn(),
  computePermFingerprint: async () => 'fp',
  getPermissions: async () => ({ roles: [], permissions: { allows: [], denies: [] } }),
  invalidatePermCache: jest.fn(),
  normalizeTs: jest.fn(),
  warmPermissions: jest.fn()
}));

jest.unstable_mockModule('../../framework/security/auth/device/device.js', () => ({
  DEVICE_TYPE: { STANDARD: 'standard' },
  detectDeviceType: jest.fn(),
  getDeviceId: async () => 'dev-from-server',
  getDeviceIdAndWrapResponse: jest.fn(),
  getClientDeviceId: jest.fn(),
  computeDeviceFingerprint: () => 'fingerprint-1'
}));

jest.unstable_mockModule('../../framework/security/auth/risk/anomaly-detector.js', () => ({
  DETECT_RESULT: {},
  detectLoginAnomaly: jest.fn(),
  detectLoginEnvironmentAnomaly: jest.fn(),
  // 模拟真实 detectSessionRisk 的免验短路：verified 标记命中 → 直接 safe
  // （真实实现的免验判定在检测层内完成，risk-hooks 不再单独查标记）
  detectSessionRisk: async () => {
    if (state.verified) return { level: 'safe', reasons: ['already_verified'] };
    return state.risk;
  },
  confirmVerifyToken: jest.fn(),
  isHighRiskRequest: request => request.method !== 'GET',
  registerRiskVerifyUrl: jest.fn(), // 门面 re-export 面必须给全（窄 mock 会炸加载）
  clearAccountLock: jest.fn(),
  clearIpLock: jest.fn()
}));

jest.unstable_mockModule('../../framework/persistence/redis/index.js', () => ({
  getStore: () => ({ get: async () => null, set: async () => {} }),
  createRingQueue: () => ({ push: async () => {}, shift: async () => null, size: 0 })
}));

const { default: authPlugin } = await import('../../framework/security/auth/index.js');

let app;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(authPlugin);

  app.get('/whoami', async request => ({
    user: request.state?.user ?? null,
    risk: request.state?.risk ?? null
  }));
  app.post('/write', async () => {
    state.handlerCalls++;
    return { ok: true };
  });

  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  state.session = null;
  state.risk = { level: 'safe' };
  state.verified = false;
  state.handlerCalls = 0;
});

const validSession = {
  userId: 42,
  uid: 'user-uuid-42',
  username: 'alice',
  email: 'alice@example.com',
  avatar: null,
  status: 1,
  appId: 'firewall',
  roles: ['user_normal'],
  permissions: { allows: ['user:profile:read'], denies: [] },
  sessionId: 'sid-42',
  deviceId: 'dev-from-server',
  userAgent: 'jest',
  ip: '127.0.0.1'
};

describe('无凭证请求', () => {
  it('不写入 state.user（空白请求不能拿到身份）', async () => {
    const res = await app.inject({ method: 'GET', url: '/whoami' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });

  it('畸形的 sid cookie 不产生身份也不 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/whoami', cookies: { sid: 'not-a-signed-cookie' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });
});

describe('Session 认证', () => {
  it('有效 sid：state.user 字段映射正确（sub 取 uid 而不是内部 id）', async () => {
    state.session = validSession;
    const res = await app.inject({ method: 'GET', url: '/whoami', cookies: { sid: 'signed-sid' } });

    expect(res.statusCode).toBe(200);
    const { user } = res.json();
    expect(user).toMatchObject({
      sub: 'user-uuid-42',
      uid: 'user-uuid-42',
      userId: 42,
      username: 'alice',
      appId: 'firewall',
      roles: ['user_normal'],
      sessionId: 'sid-42'
    });
  });

  it('sid 存在但会话已失效：不被当成已登录', async () => {
    state.session = null;
    const res = await app.inject({ method: 'GET', url: '/whoami', cookies: { sid: 'expired-sid' } });
    expect(res.json().user).toBeNull();
  });
});

describe('会话风险拦截', () => {
  it('warn 级风险 + 写操作：403，且业务 handler 不执行', async () => {
    state.session = validSession;
    state.risk = {
      level: 'warn',
      reasons: ['device_fingerprint_changed'],
      verify: { url: '/verify/v1/slider', header: 'x-verify-token', token: 'tok-1' }
    };

    const res = await app.inject({ method: 'POST', url: '/write', cookies: { sid: 'signed-sid' } });

    expect(res.statusCode).toBe(403);
    expect(state.handlerCalls).toBe(0);
    expect(res.json().__risk__).toMatchObject({
      level: 'warn',
      verifyUrl: '/verify/v1/slider',
      verifyHeader: 'x-verify-token'
    });
  });

  it('已完成人机验证（服务端免验标记）时放行写操作', async () => {
    state.session = validSession;
    state.verified = true;
    state.risk = {
      level: 'warn',
      reasons: ['device_fingerprint_changed'],
      verify: { url: '/verify/v1/slider', header: 'x-verify-token', token: 'tok-1' }
    };

    const res = await app.inject({ method: 'POST', url: '/write', cookies: { sid: 'signed-sid' } });
    expect(res.statusCode).toBe(200);
    expect(state.handlerCalls).toBe(1);
  });

  it('读操作不阻断，但在响应体注入 __risk__ 让前端弹验证', async () => {
    state.session = validSession;
    state.risk = {
      level: 'info',
      reasons: ['ip_changed'],
      verify: { url: '/verify/v1/slider', header: 'x-verify-token', token: 'tok-2' }
    };

    const res = await app.inject({ method: 'GET', url: '/whoami', cookies: { sid: 'signed-sid' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ sub: 'user-uuid-42' });
    expect(body.__risk__).toMatchObject({ level: 'info', reasons: ['ip_changed'] });
  });
});
