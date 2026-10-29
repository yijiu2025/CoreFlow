import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const makeStore = () => {
  const values = new Map();
  const sets = new Map();
  return {
    async get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
    async expire() {
      return 1;
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
    reset() {
      values.clear();
      sets.clear();
    }
  };
};

const stores = new Map();
const getStore = prefix => {
  if (!stores.has(prefix)) stores.set(prefix, makeStore());
  return stores.get(prefix);
};

const dbCalls = { userFindByPk: 0, tokenUpdate: [] };
const models = {
  User: {
    async findByPk() {
      dbCalls.userFindByPk += 1;
      return null;
    }
  },
  SessionToken: {
    async findOne() {
      return null;
    },
    async update(values, options) {
      dbCalls.tokenUpdate.push({ values, options });
      return [1];
    }
  },
  UserRole: {
    async findAll() {
      return [];
    }
  },
  Role: {
    async findAll() {
      return [];
    }
  },
  InlinePolicy: {
    async findAll() {
      return [];
    }
  },
  SessionLog: {
    async create(row) {
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

const { getSession, sidHash } = await import('../../../framework/auth/session.js');
const { computePermFingerprint } = await import('../../../framework/auth/perm-cache.js');
const { sessionStore } = await import('../../../framework/auth/session-store.js');
const { signCookie, COOKIE_SID, COOKIE_SID_R } = await import('../../../framework/auth/cookie.js');

const UID = 7;
const UUID = 'uid-7';
const APP = 'app';
const NOW = Date.parse('2026-10-01T00:00:00.000Z');
let nowMs;

const makeReply = () => ({
  cookiesSet: [],
  cookiesCleared: [],
  setCookie(...args) {
    this.cookiesSet.push(args);
  },
  clearCookie(...args) {
    this.cookiesCleared.push(args);
  }
});

const requestSession = (sid, reply) => getSession({ cookies: { [COOKIE_SID]: signCookie(sid, 0) }, reply });

const activeUser = () => ({
  id: UUID,
  numericId: UID,
  uid: UUID,
  username: 'user',
  email: 'u@example.test',
  avatar: null,
  status: 1
});

const seedUserCache = status => getStore('user').set(UUID, { ...activeUser(), status });

const emptyPermissionModels = () => {
  models.UserRole.findAll = async () => [];
  models.Role.findAll = async () => [];
  models.InlinePolicy.findAll = async () => [];
};

beforeEach(() => {
  for (const store of stores.values()) store.reset();
  dbCalls.userFindByPk = 0;
  dbCalls.tokenUpdate.length = 0;
  nowMs = NOW;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  emptyPermissionModels();
  models.SessionToken.findOne = async () => null;
  models.SessionToken.update = async (values, options) => {
    dbCalls.tokenUpdate.push({ values, options });
    return [1];
  };
});

afterEach(() => {
  Date.now.mockRestore();
});

describe('禁用用户的 Session 认证阻断', () => {
  test('Redis Session 命中时，用户缓存中的禁用状态必须拒绝并吊销当前会话', async () => {
    const sid = 'sid-redis-disabled';
    await seedUserCache(0);
    await sessionStore.set(
      sid,
      {
        userId: UID,
        uid: UUID,
        status: 1,
        appId: APP,
        roles: ['admin'],
        permissions: { allows: ['sensitive:write'], denies: [] },
        permFingerprint: 'old',
        rememberMe: false
      },
      300
    );
    const reply = makeReply();

    const result = await requestSession(sid, reply);

    expect(result).toBeNull();
    expect(await sessionStore.get(sid)).toBeNull();
    expect(dbCalls.tokenUpdate.some(call => call.options.where.token === sidHash(sid))).toBe(true);
    expect(reply.cookiesCleared.some(([name]) => name === COOKIE_SID)).toBe(true);
    expect(reply.cookiesCleared.some(([name]) => name === COOKIE_SID_R)).toBe(true);
  });

  test('DB SessionToken 恢复时，禁用用户不得重建 Redis Session', async () => {
    const sid = 'sid-db-disabled';
    const tokenUpdate = jest.fn(async () => {});
    models.SessionToken.findOne = async () => ({
      token: sidHash(sid),
      user_id: UID,
      app_id: APP,
      remember_me: false,
      last_active: new Date(nowMs),
      createdAt: new Date(nowMs),
      user: { ...activeUser(), id: UID, status: 0 },
      update: tokenUpdate
    });
    const reply = makeReply();

    const result = await requestSession(sid, reply);

    expect(result).toBeNull();
    expect(await sessionStore.get(sid)).toBeNull();
    expect(tokenUpdate).toHaveBeenCalledWith({ revoked: true });
    expect(reply.cookiesCleared.some(([name]) => name === COOKIE_SID)).toBe(true);
  });
});

describe('角色自然到期后的 Session 权限快照', () => {
  const installExpiringRole = ({ failReload = false } = {}) => {
    const assignment = {
      id: 11,
      role_id: 22,
      updatedAt: new Date(NOW - 1000),
      deletedAt: null,
      expire_at: new Date(NOW + 60_000),
      get(key) {
        return this[key];
      }
    };
    const role = {
      id: 22,
      code: 'temporary-admin',
      policy: { allows: ['sensitive:write'], denies: [] },
      updatedAt: new Date(NOW - 1000),
      deletedAt: null,
      get(key) {
        return this[key];
      }
    };
    models.UserRole.findAll = async options => {
      if (options.paranoid === false) return [assignment];
      if (failReload) throw new Error('permission source unavailable');
      return assignment.expire_at.getTime() > nowMs ? [{ ...assignment, role }] : [];
    };
    models.Role.findAll = async () => [role];
    models.InlinePolicy.findAll = async () => [];
  };

  const seedSessionWithFingerprint = async (sid, permFingerprint) => {
    await seedUserCache(1);
    await sessionStore.set(
      sid,
      {
        userId: UID,
        uid: UUID,
        status: 1,
        appId: APP,
        roles: ['temporary-admin'],
        permissions: { allows: ['sensitive:write'], denies: [] },
        permFingerprint,
        rememberMe: false
      },
      300
    );
  };

  test('expire_at 跨过到期时刻而 DB 行未更新，也必须失效并回源移除敏感权限', async () => {
    installExpiringRole();
    const sid = 'sid-role-expired';
    const initialFingerprint = await computePermFingerprint(UID, APP);
    await seedSessionWithFingerprint(sid, initialFingerprint);

    nowMs += 61_000;
    const result = await requestSession(sid, makeReply());

    expect(result).not.toBeNull();
    expect(result.roles).toEqual([]);
    expect(result.permissions).toEqual({ allows: [], denies: [] });
  });

  test('自然到期触发回源但回源失败时，不得继续返回过期敏感快照', async () => {
    installExpiringRole({ failReload: true });
    const sid = 'sid-role-expired-reload-failed';
    const initialFingerprint = await computePermFingerprint(UID, APP);
    await seedSessionWithFingerprint(sid, initialFingerprint);

    nowMs += 61_000;
    const result = await requestSession(sid, makeReply());

    expect(result).toBeNull();
  });
});
