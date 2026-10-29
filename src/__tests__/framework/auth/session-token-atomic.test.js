import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { getMapStore, MapStore } from '../../../framework/redis/map-store.js';

const tokenStore = getMapStore('session_token');
const createSession = jest.fn();
const stores = new Map([['session_token', tokenStore]]);

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({
  getStore(prefix) {
    if (!stores.has(prefix)) stores.set(prefix, getMapStore(prefix));
    return stores.get(prefix);
  }
}));
jest.unstable_mockModule('../../../framework/auth/session.js', () => ({
  createSession,
  updateRememberMe: jest.fn(),
  switchSessionByRefreshToken: jest.fn(),
  revokeRememberMe: jest.fn()
}));
jest.unstable_mockModule('../../../framework/db/index.js', () => ({ getModel: jest.fn() }));
jest.unstable_mockModule('../../../framework/jwt/index.js', () => ({ verify: jest.fn() }));
jest.unstable_mockModule('../../../framework/log/index.js', () => ({
  default: { info() {}, warn() {}, error() {}, debug() {} },
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
  log: { info() {}, warn() {}, error() {}, debug() {} }
}));

const { bindSessionToCookie } = await import('../../../framework/auth/session-api.service.js');

const sessionData = {
  userId: 7,
  uid: 'uid-7',
  username: 'alice',
  email: 'alice@example.test',
  appId: 'app',
  rememberMe: false
};
const request = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } };
const makeReply = () => ({ setCookie: jest.fn(), clearCookie: jest.fn() });

beforeEach(() => {
  for (const prefix of stores.keys()) MapStore.clear(prefix);
  createSession.mockReset();
  createSession.mockResolvedValue({ sessionId: 'sid', refreshToken: null, familyId: 'family' });
});

describe('session_token 原子消费', () => {
  test('同一临时 token 的并发绑定只能创建一个正式 Session，且 token 被删除', async () => {
    await tokenStore.set('once', sessionData, 60);

    const results = await Promise.all([
      bindSessionToCookie('once', request, makeReply()),
      bindSessionToCookie('once', request, makeReply())
    ]);

    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok && result.statusCode === 401)).toHaveLength(1);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(await tokenStore.ttl('once')).toBe(-2);
  });

  test('无效 token 返回 401，缺失 token 返回 400，均不得创建 Session', async () => {
    expect(await bindSessionToCookie('missing', request, makeReply())).toMatchObject({ ok: false, statusCode: 401 });
    expect(await bindSessionToCookie('', request, makeReply())).toMatchObject({ ok: false, statusCode: 400 });
    expect(createSession).not.toHaveBeenCalled();
  });
});
