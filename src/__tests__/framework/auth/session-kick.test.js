/**
 * 会话踢出/吊销路径行为测试（session-kick）
 *
 * 背景：批次 C 把 session.js 的 6 条踢出路径拆入 session-kick.js，并抽出公共原语
 * `_revokeOneSession()`（AUDIT-REPORT-2026-09-12.md 🔵-3）。这些路径原本**零测试覆盖**，
 * 纯重构最怕的就是"看起来等价、实际漏了一步清理"，故在此把每条路径的清理集合固化。
 *
 * 覆盖的不变量：
 * - 每条路径都完成「删 Redis session → 失效 sid_r（refreshStore/userRefreshStore/familyStore）
 *   → 清 user_sessions 逆索引 → revoke DB token」
 * - 筛选语义：kickByDeviceType 按 appId+deviceType、kickByDeviceId 按 appId+deviceId、
 *   kickUser 可按 appId 过滤；僵尸索引项（Redis session 已过期）被清出索引
 * - DB revoke 粒度：单条路径逐条 update；批量路径收集 hashes 后一次 Op.in
 * - SessionLog 事件与 details.reason 与拆分前逐字一致
 *
 * mock 沿用仓库既有 unstable_mockModule 模式（见 anomaly-detector.test.js）。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { Op } from 'sequelize';

// ── 内存 store 桩（按 prefix 缓存，模拟 getStore 的同 prefix 同实例语义）──
const makeStore = () => {
  const kv = new Map();
  const z = new Map();
  return {
    async get(k) {
      return kv.has(k) ? kv.get(k) : null;
    },
    async set(k, v) {
      kv.set(k, v);
    },
    async delete(k) {
      kv.delete(k);
    },
    async expire() {
      return 1;
    },
    async zAdd(key, score, member) {
      if (!z.has(key)) z.set(key, new Map());
      z.get(key).set(member, score);
      return 1;
    },
    async zRem(key, members) {
      const s = z.get(key);
      if (!s) return 0;
      let n = 0;
      for (const m of members) if (s.delete(m)) n++;
      return n;
    },
    async zRangeByScore(key) {
      const s = z.get(key);
      return s ? [...s.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m) : [];
    },
    async zCard(key) {
      return z.get(key)?.size ?? 0;
    },
    async size() {
      return kv.size;
    },
    /**
     * 清空内容但**保留实例身份**。store 实例在模块 import 时就被 session-store.js 捕获，
     * 若在 beforeEach 换新实例（storeCache.clear()），被测代码仍用旧实例 → 测试间状态泄漏、
     * 断言到上一轮的脏数据。
     */
    reset() {
      kv.clear();
      z.clear();
    }
  };
};
const storeCache = new Map();
const getStore = prefix => {
  if (!storeCache.has(prefix)) storeCache.set(prefix, makeStore());
  return storeCache.get(prefix);
};
/** 每个测试前调用（**不要**用 storeCache.clear()） */
const resetStores = () => {
  for (const s of storeCache.values()) s.reset();
};

// ── DB 模型桩 ──
const dbCalls = { tokenUpdate: [], logCreate: [] };
const modelStubs = {
  SessionToken: {
    async update(values, opts) {
      dbCalls.tokenUpdate.push({ values, opts });
      return [1];
    }
  },
  SessionLog: {
    async create(row) {
      dbCalls.logCreate.push(row);
      return row;
    }
  }
};

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({ default: {}, getStore }));
jest.unstable_mockModule('../../../framework/db/index.js', () => ({
  default: {},
  getModel: name =>
    modelStubs[name] || {
      async count() {
        return 0;
      },
      async findOne() {
        return null;
      }
    }
}));

const { sessionStore, userSessionsStore, refreshStore, userRefreshStore, familyStore, sidHash } =
  await import('../../../framework/auth/session-store.js');
const { kickByDeviceType, kickByDeviceId, kickSession, kickAllSessions, kickUser } =
  await import('../../../framework/auth/session-kick.js');
const { DEVICE_TYPE } = await import('../../../framework/auth/device.js');

const UID = 42;
const APP = 'app1';
const FAM = 'fam-1';

/** 写入一条 session + 逆索引；可指定 appId / deviceType / deviceId / familyId */
async function seedSession(
  sid,
  { appId = APP, deviceType = DEVICE_TYPE.BROWSER, deviceId = null, familyId = FAM } = {}
) {
  await sessionStore.set(sid, { userId: UID, appId, deviceType, deviceId, familyId }, 60);
  await userSessionsStore.zAdd(String(UID), Date.now(), sid);
}

/** 写入一条绑定到 session 的 sid_r（refreshToken），供失效 sid_r 断言 */
async function seedRefreshToken(rt, sid, familyId = FAM) {
  await refreshStore.set(rt, sid);
  await userRefreshStore.zAdd(String(UID), Date.now(), rt);
  if (familyId) await familyStore.zAdd(familyId, Date.now(), rt);
}

beforeEach(() => {
  resetStores();
  dbCalls.tokenUpdate.length = 0;
  dbCalls.logCreate.length = 0;
});

describe('kickByDeviceType：同用户+同应用+同设备类型旧会话被踢', () => {
  test('只踢匹配项，僵尸索引项被清出，其余会话不动', async () => {
    await seedSession('sid-browser', { deviceType: DEVICE_TYPE.BROWSER, familyId: 'f-b' });
    await seedSession('sid-app', { deviceType: DEVICE_TYPE.APP, familyId: 'f-a' });
    await seedSession('sid-other-app', { appId: 'app2', deviceType: DEVICE_TYPE.BROWSER, familyId: 'f-o' });
    // 僵尸：索引里有、Redis session 已过期
    await userSessionsStore.zAdd(String(UID), Date.now(), 'sid-zombie');
    await seedRefreshToken('rt-1', 'sid-browser', 'f-b');

    await kickByDeviceType(UID, APP, DEVICE_TYPE.BROWSER);

    // 被踢：Redis session 删除 + 逆索引清理 + refreshToken 失效（含 family 集合）
    expect(await sessionStore.get('sid-browser')).toBeNull();
    expect(await userSessionsStore.zRangeByScore(String(UID))).not.toContain('sid-browser');
    expect(await refreshStore.get('rt-1')).toBeNull();
    expect(await userRefreshStore.zRangeByScore(String(UID))).not.toContain('rt-1');
    expect(await familyStore.zRangeByScore('f-b')).not.toContain('rt-1');
    // 未匹配：完整保留
    expect(await sessionStore.get('sid-app')).not.toBeNull();
    expect(await sessionStore.get('sid-other-app')).not.toBeNull();
    // 僵尸：从逆索引清出
    expect(await userSessionsStore.zRangeByScore(String(UID))).not.toContain('sid-zombie');
    // DB revoke：单条，按 sha256(sid) 定位
    expect(dbCalls.tokenUpdate).toHaveLength(1);
    expect(dbCalls.tokenUpdate[0].values).toEqual({ revoked: true });
    expect(dbCalls.tokenUpdate[0].opts.where.token).toBe(sidHash('sid-browser'));
    // 审计日志
    expect(dbCalls.logCreate).toHaveLength(1);
    expect(dbCalls.logCreate[0]).toMatchObject({
      user_id: UID,
      event: 'KICK',
      app_id: APP,
      details: { reason: 'single_device_login', deviceType: DEVICE_TYPE.BROWSER, kickedSessionId: 'sid-browser' }
    });
  });
});

describe('kickByDeviceId：按设备精准踢，不误伤同类型其它设备', () => {
  test('只踢 deviceId 命中的那条，并返回踢出数', async () => {
    await seedSession('sid-d1', { deviceId: 'WEB-AAA', familyId: 'f-1' });
    await seedSession('sid-d2', { deviceId: 'WEB-BBB', familyId: 'f-2' });

    const kicked = await kickByDeviceId(UID, APP, 'WEB-AAA');

    expect(kicked).toBe(1);
    expect(await sessionStore.get('sid-d1')).toBeNull();
    expect(await sessionStore.get('sid-d2')).not.toBeNull();
    expect(dbCalls.logCreate[0].details.reason).toBe('kick_by_device_id');
    expect(dbCalls.logCreate[0].details.deviceId).toBe('WEB-AAA');
  });

  test('deviceId 缺失 → 直接返回 0，不作任何清理', async () => {
    await seedSession('sid-d1', { deviceId: 'WEB-AAA' });
    expect(await kickByDeviceId(UID, APP, '')).toBe(0);
    expect(await sessionStore.get('sid-d1')).not.toBeNull();
    expect(dbCalls.tokenUpdate).toHaveLength(0);
  });
});

describe('kickSession：踢指定会话（含 userId 为空的操作者场景）', () => {
  test('正常踢出：删会话 + 失效 sid_r + 清索引 + revoke DB + 写 user_kicked 日志', async () => {
    await seedSession('sid-x', { familyId: 'f-x' });
    await seedRefreshToken('rt-x', 'sid-x', 'f-x');

    await kickSession('sid-x', UID);

    expect(await sessionStore.get('sid-x')).toBeNull();
    expect(await userSessionsStore.zRangeByScore(String(UID))).not.toContain('sid-x');
    expect(await refreshStore.get('rt-x')).toBeNull();
    expect(dbCalls.tokenUpdate[0].opts.where.token).toBe(sidHash('sid-x'));
    expect(dbCalls.logCreate[0]).toMatchObject({
      user_id: UID,
      event: 'KICK',
      details: { reason: 'user_kicked', kickedSessionId: 'sid-x' }
    });
  });

  test('userId 为 null：跳过用户维度的索引/refreshToken 清理，但仍删 Redis 与 revoke DB', async () => {
    await seedSession('sid-y', { familyId: 'f-y' });

    await kickSession('sid-y', null);

    expect(await sessionStore.get('sid-y')).toBeNull();
    // 索引保留（无 userId 无法定位），未做用户维度清理——与拆分前语义一致
    expect(await userSessionsStore.zRangeByScore(String(UID))).toContain('sid-y');
    expect(dbCalls.tokenUpdate).toHaveLength(1);
    expect(dbCalls.logCreate[0].user_id).toBeNull();
  });

  test('会话已不存在（sd=null）：不抛错，familyId 按 null 处理', async () => {
    await kickSession('sid-missing', UID);
    expect(dbCalls.tokenUpdate).toHaveLength(1);
    expect(dbCalls.logCreate[0].details.kickedSessionId).toBe('sid-missing');
  });
});

describe('kickAllSessions：全端下线，批量 revoke', () => {
  test('清空该用户全部会话，DB 只发一次 Op.in 批量 revoke', async () => {
    await seedSession('sid-1', { appId: 'app1', familyId: 'f-1' });
    await seedSession('sid-2', { appId: 'app2', familyId: 'f-2' });
    await seedRefreshToken('rt-1', 'sid-1', 'f-1');
    await seedRefreshToken('rt-2', 'sid-2', 'f-2');

    await kickAllSessions(UID);

    expect(await sessionStore.get('sid-1')).toBeNull();
    expect(await sessionStore.get('sid-2')).toBeNull();
    expect(await refreshStore.get('rt-1')).toBeNull();
    expect(await refreshStore.get('rt-2')).toBeNull();
    expect(await userSessionsStore.zRangeByScore(String(UID))).toEqual([]);
    // 批量：恰好一次 update，hashes 全部命中
    expect(dbCalls.tokenUpdate).toHaveLength(1);
    const hashes = dbCalls.tokenUpdate[0].opts.where.token[Op.in];
    expect(hashes.sort()).toEqual([sidHash('sid-1'), sidHash('sid-2')].sort());
    expect(dbCalls.logCreate[0].details).toEqual({ reason: 'kick_all', count: 2 });
  });
});

describe('kickUser：管理员踢人（可按应用过滤）', () => {
  test('指定 appId：只踢该应用会话，并清出僵尸索引项', async () => {
    await seedSession('sid-a1', { appId: 'app1', familyId: 'f-a1' });
    await seedSession('sid-a2', { appId: 'app2', familyId: 'f-a2' });
    await userSessionsStore.zAdd(String(UID), Date.now(), 'sid-zombie');

    await kickUser(UID, 'app1');

    expect(await sessionStore.get('sid-a1')).toBeNull();
    expect(await sessionStore.get('sid-a2')).not.toBeNull();
    expect(await userSessionsStore.zRangeByScore(String(UID))).not.toContain('sid-zombie');
    expect(dbCalls.logCreate[0]).toMatchObject({ event: 'KICK', app_id: 'app1' });
    expect(dbCalls.logCreate[0].details).toEqual({ kickedCount: 1 });
  });

  test('appId 为 null：踢全部应用，日志 app_id 记为 ALL', async () => {
    await seedSession('sid-a1', { appId: 'app1', familyId: 'f-a1' });
    await seedSession('sid-a2', { appId: 'app2', familyId: 'f-a2' });

    await kickUser(UID, null);

    expect(await sessionStore.get('sid-a1')).toBeNull();
    expect(await sessionStore.get('sid-a2')).toBeNull();
    expect(dbCalls.logCreate[0]).toMatchObject({ event: 'KICK', app_id: 'ALL' });
    expect(dbCalls.logCreate[0].details).toEqual({ kickedCount: 2 });
  });
});

describe('_revokeOneSession 抽取后的等价性（🔵-3 回归）', () => {
  test('同一条 session 被不同入口踢出时清理集合完全一致', async () => {
    // 入口 A：kickSession
    await seedSession('sid-eq', { familyId: 'f-eq' });
    await seedRefreshToken('rt-eq', 'sid-eq', 'f-eq');
    await kickSession('sid-eq', UID);
    const afterA = {
      session: await sessionStore.get('sid-eq'),
      inIndex: (await userSessionsStore.zRangeByScore(String(UID))).includes('sid-eq'),
      rt: await refreshStore.get('rt-eq'),
      inFamily: (await familyStore.zRangeByScore('f-eq')).includes('rt-eq')
    };

    // 入口 B：kickUser（同一初始状态）
    resetStores();
    dbCalls.tokenUpdate.length = 0;
    dbCalls.logCreate.length = 0;
    await seedSession('sid-eq', { familyId: 'f-eq' });
    await seedRefreshToken('rt-eq', 'sid-eq', 'f-eq');
    await kickUser(UID, null);
    const afterB = {
      session: await sessionStore.get('sid-eq'),
      inIndex: (await userSessionsStore.zRangeByScore(String(UID))).includes('sid-eq'),
      rt: await refreshStore.get('rt-eq'),
      inFamily: (await familyStore.zRangeByScore('f-eq')).includes('rt-eq')
    };

    expect(afterA).toEqual({ session: null, inIndex: false, rt: null, inFamily: false });
    expect(afterB).toEqual(afterA);
    // DB 侧等价：两者都对同一个 hash 做了 revoke
    expect(dbCalls.tokenUpdate[0].opts.where.token[Op.in]).toEqual([sidHash('sid-eq')]);
  });

  test('DB 不可用时踢出会抛错，不静默吞（family 清理已完成，具备重试幂等性）', async () => {
    await seedSession('sid-fail', { familyId: 'f-fail' });
    const original = modelStubs.SessionToken.update;
    modelStubs.SessionToken.update = async () => {
      throw new Error('DB down');
    };

    await expect(kickByDeviceId(UID, APP, null)).resolves.toBe(0); // deviceId 缺失时短路，不触 DB
    await expect(kickSession('sid-fail', UID)).rejects.toThrow('DB down');
    // Redis 侧清理已落地
    expect(await sessionStore.get('sid-fail')).toBeNull();

    modelStubs.SessionToken.update = original;
  });
});
