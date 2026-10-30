import { beforeEach, describe, expect, jest, test } from '@jest/globals';

function makeStore() {
  const values = new Map();
  const ttls = new Map();
  const sets = new Map();
  return {
    async get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async set(key, value, ttl) {
      values.set(key, value);
      if (ttl !== undefined) ttls.set(key, ttl);
    },
    async delete(key) {
      values.delete(key);
      ttls.delete(key);
    },
    async getDel(key) {
      const value = values.has(key) ? values.get(key) : null;
      values.delete(key);
      ttls.delete(key);
      return value;
    },
    async expire(key, ttl) {
      if (values.has(key) || sets.has(key)) ttls.set(key, ttl);
    },
    async ttl(key) {
      if (!values.has(key)) return -2;
      return ttls.has(key) ? ttls.get(key) : -1;
    },
    async zAdd(key, score, member) {
      if (!sets.has(key)) sets.set(key, new Map());
      sets.get(key).set(member, score);
    },
    async zRem(key, members) {
      for (const member of members) sets.get(key)?.delete(member);
    },
    async zRangeByScore(key) {
      return [...(sets.get(key)?.keys() || [])];
    },
    async zCard(key) {
      return sets.get(key)?.size || 0;
    },
    keys() {
      return [...values.keys()];
    },
    allSetMembers() {
      return [...sets.values()].flatMap(set => [...set.keys()]);
    },
    reset() {
      values.clear();
      ttls.clear();
      sets.clear();
    }
  };
}

const stores = new Map();
const getStore = prefix => {
  if (!stores.has(prefix)) stores.set(prefix, makeStore());
  return stores.get(prefix);
};

const state = {
  failEvent: null,
  persistedToken: null,
  transactions: 0,
  commits: 0,
  rollbacks: 0,
  record: null
};

const transaction = async work => {
  state.transactions += 1;
  const tokenBefore = state.persistedToken;
  try {
    const result = await work({ id: state.transactions });
    state.commits += 1;
    return result;
  } catch (error) {
    state.persistedToken = tokenBefore;
    state.rollbacks += 1;
    throw error;
  }
};

const models = {
  User: {
    async findByPk(id) {
      return {
        id,
        uid: 'uid-7',
        username: 'user',
        email: 'u@example.test',
        avatar: null,
        status: 1
      };
    }
  },
  UserSession: {
    async upsert() {
      return [{}, true];
    }
  },
  SessionToken: {
    sequelize: { transaction },
    async findOrCreate() {
      return [{ async update() {} }, true];
    },
    async create(row) {
      return row;
    },
    async destroy() {
      return 0;
    },
    async findOne() {
      return state.record;
    },
    async update(values, options) {
      if (options.where.token !== state.persistedToken || state.record?.revoked) return [0];
      state.persistedToken = values.token;
      return [1];
    }
  },
  SessionLog: {
    async create(row) {
      if (state.failEvent === row.event) throw new Error(`${row.event} log failed`);
      return row;
    }
  }
};

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({ default: {}, getStore }));
jest.unstable_mockModule('../../../framework/db/index.js', () => ({
  default: {},
  getModel: name => models[name]
}));
jest.unstable_mockModule('../../../framework/log/index.js', () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} })
}));
jest.unstable_mockModule('../../../framework/auth/perm-cache.js', () => ({
  getPermissions: async () => ({ roles: ['user'], permissions: { allows: ['user:read'], denies: [] } }),
  computePermFingerprint: async () => 'fingerprint'
}));
jest.unstable_mockModule('../../../framework/auth/session-perm.js', () => ({
  resolveSessionPermissions: async () => ({
    roles: ['user'],
    permissions: { allows: ['user:read'], denies: [] },
    permFingerprint: 'fingerprint'
  })
}));
jest.unstable_mockModule('../../../framework/auth/session-governance.js', () => ({
  checkMaxSessions: async () => null,
  pruneActiveDevices: async () => 0,
  pruneStaleSessionTokens: async () => 0,
  getSessionStats: async () => ({}),
  getLoginTrend: async () => [],
  logLoginFailure: async () => {}
}));
jest.unstable_mockModule('../../../framework/auth/session-kick.js', () => ({
  kickByDeviceType: async () => {},
  kickSession: async () => {},
  kickAllSessions: async () => {},
  kickByDeviceId: async () => 0,
  kickUser: async () => {}
}));

const { createSession, refreshSessionCore, sidHash } = await import('../../../framework/auth/session.js');
const { sessionStore, refreshStore, userRefreshStore, rotatedStore, familyStore, userSessionsStore } =
  await import('../../../framework/auth/session-store.js');

const OLD_SID = 'a'.repeat(64);
const OLD_RT = 'b'.repeat(64);
const FAMILY = 'family-7';
const USER_KEY = '7';

const makeReply = () => ({
  cookiesSet: [],
  setCookie(...args) {
    this.cookiesSet.push(args);
  }
});

const createParams = () => ({
  userId: 7,
  uid: 'uid-7',
  username: 'user',
  email: 'u@example.test',
  avatar: null,
  status: 1,
  appId: 'app',
  ip: '127.0.0.1',
  deviceId: 'device-7',
  deviceType: 'browser',
  userAgent: 'jest',
  rememberMe: true,
  multiDevice: true,
  reply: makeReply()
});

async function seedRefresh({ redisMapping = true } = {}) {
  const oldHash = sidHash(OLD_SID);
  state.persistedToken = oldHash;
  state.record = {
    id: 99,
    user_id: 7,
    token: oldHash,
    revoked: false,
    app_id: 'app',
    family_id: FAMILY,
    remember_me: true,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ip: '127.0.0.1',
    device_id: 'device-7',
    user_agent: 'jest'
  };
  const oldData = {
    userId: 7,
    uid: 'uid-7',
    appId: 'app',
    familyId: FAMILY,
    rememberMe: true,
    roles: ['user'],
    permissions: { allows: ['user:read'], denies: [] },
    permFingerprint: 'fingerprint'
  };
  if (redisMapping) {
    await sessionStore.set(OLD_SID, oldData, 1800);
    await refreshStore.set(OLD_RT, OLD_SID, 1800);
    await userRefreshStore.zAdd(USER_KEY, 1, OLD_RT);
    await familyStore.zAdd(FAMILY, 1, OLD_RT);
    await userSessionsStore.zAdd(USER_KEY, 1, OLD_SID);
  }
  return oldData;
}

beforeEach(() => {
  for (const store of stores.values()) store.reset();
  state.failEvent = null;
  state.persistedToken = null;
  state.transactions = 0;
  state.commits = 0;
  state.rollbacks = 0;
  state.record = null;
});

describe('Session 跨存储 Saga', () => {
  test('创建成功时 Redis 与 DB 同一流程提交', async () => {
    const result = await createSession(createParams());

    expect(await sessionStore.get(result.sessionId)).toMatchObject({ userId: 7, familyId: result.familyId });
    expect(await refreshStore.get(result.refreshToken)).toBe(result.sessionId);
    expect(state.commits).toBe(1);
    expect(state.rollbacks).toBe(0);
  });

  test('创建 DB 事务失败时清理全部新 Redis 凭证和索引', async () => {
    state.failEvent = 'LOGIN';

    await expect(createSession(createParams())).rejects.toThrow('LOGIN log failed');

    expect(state.rollbacks).toBe(1);
    expect(sessionStore.keys()).toEqual([]);
    expect(refreshStore.keys()).toEqual([]);
    expect(await userRefreshStore.zRangeByScore(USER_KEY)).toEqual([]);
    expect(await userSessionsStore.zRangeByScore(USER_KEY)).toEqual([]);
    expect(familyStore.allSetMembers()).toEqual([]);
  });

  test('刷新 DB 事务失败时删除新链并恢复旧 Session、refresh token 与索引', async () => {
    const oldData = await seedRefresh();
    state.failEvent = 'SESSION_REFRESH';

    await expect(refreshSessionCore(OLD_RT, { ip: '127.0.0.1' }, makeReply())).rejects.toThrow(
      'SESSION_REFRESH log failed'
    );

    expect(state.rollbacks).toBe(1);
    expect(await sessionStore.get(OLD_SID)).toEqual(oldData);
    expect(await refreshStore.get(OLD_RT)).toBe(OLD_SID);
    expect(await rotatedStore.get(OLD_RT)).toBeNull();
    expect(sessionStore.keys()).toEqual([OLD_SID]);
    expect(refreshStore.keys()).toEqual([OLD_RT]);
    expect(await userRefreshStore.zRangeByScore(USER_KEY)).toEqual([OLD_RT]);
    expect(await userSessionsStore.zRangeByScore(USER_KEY)).toEqual([OLD_SID]);
    expect(await familyStore.zRangeByScore(FAMILY)).toEqual([OLD_RT]);
    expect(state.persistedToken).toBe(sidHash(OLD_SID));
  });

  test('Redis 映射丢失的 DB 兜底刷新，并发时仅一个请求成功且保留成功链标记', async () => {
    await seedRefresh({ redisMapping: false });

    const results = await Promise.all([
      refreshSessionCore(OLD_RT, { ip: '127.0.0.1' }, makeReply()),
      refreshSessionCore(OLD_RT, { ip: '127.0.0.1' }, makeReply())
    ]);
    const succeeded = results.filter(Boolean);

    expect(succeeded).toHaveLength(1);
    expect(sessionStore.keys()).toEqual([succeeded[0].newSessionId]);
    expect(refreshStore.keys()).toEqual([succeeded[0].newRefreshToken]);
    expect(await refreshStore.get(succeeded[0].newRefreshToken)).toBe(succeeded[0].newSessionId);
    expect(await rotatedStore.get(OLD_RT)).toMatchObject({ familyId: FAMILY, userId: 7 });
    expect(state.persistedToken).toBe(sidHash(succeeded[0].newSessionId));
  });
});
