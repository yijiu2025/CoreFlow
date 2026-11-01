/**
 * 账号封禁（ban.js）行为测试
 *
 * 覆盖：service 维度封禁/解封、时限与永久、阶梯等级（disableLevel 系列）、
 * checkDisable 错误形状（code=ACCOUNT_BANNED 供调用方分支判定）、事件广播。
 *
 * mock 沿用仓库既有 unstable_mockModule 模式（见 session-kick.test.js）：
 * redis 换内存 store 桩，log 换静音桩。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// ── 内存 store 桩（与 session-kick.test.js 同构）──
const makeStore = () => {
  const kv = new Map();
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
    reset() {
      kv.clear();
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

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({ default: {}, getStore }));
jest.unstable_mockModule('../../../framework/log/index.js', () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} })
}));

const ban = await import('../../../framework/auth/security/ban.js');
const { AUTH_EVENTS, onAuthEvent, removeAllAuthListeners } = await import('../../../framework/auth/audit/events.js');

const UID = 42;

beforeEach(() => {
  resetStores();
  removeAllAuthListeners();
});

describe('disable / isDisable / untieDisable：基础封禁语义', () => {
  test('封禁后 isDisable 为真，解封后为假', async () => {
    await ban.disable(UID, 'login', 3600, { reason: '违规' });
    expect(await ban.isDisable(UID, 'login')).toBe(true);

    await ban.untieDisable(UID, 'login');
    expect(await ban.isDisable(UID, 'login')).toBe(false);
  });

  test('不同 service 维度互不影响', async () => {
    await ban.disable(UID, 'login', 3600);
    expect(await ban.isDisable(UID, 'access')).toBe(false);
    expect(await ban.isDisable(UID, 'login')).toBe(true);
  });

  test('不同用户互不影响', async () => {
    await ban.disable(UID, 'login', 3600);
    expect(await ban.isDisable(43, 'login')).toBe(false);
  });

  test('getDisableTime：未封禁 -2 / 临时=剩余秒数 / 永久 -1', async () => {
    expect(await ban.getDisableTime(UID, 'login')).toBe(-2);

    await ban.disable(UID, 'login', 3600);
    const t = await ban.getDisableTime(UID, 'login');
    expect(t).toBeGreaterThan(3500);
    expect(t).toBeLessThanOrEqual(3600);

    await ban.disable(UID, 'comment', -1);
    expect(await ban.getDisableTime(UID, 'comment')).toBe(-1);
  });

  test('time 参数校验：非正数与非法值抛错', async () => {
    await expect(ban.disable(UID, 'login', 0)).rejects.toThrow('time');
    await expect(ban.disable(UID, 'login', -2)).rejects.toThrow('time');
    await expect(ban.disable(UID, 'login', 'abc')).rejects.toThrow('time');
    // -1 是永久哨兵，合法
    await expect(ban.disable(UID, 'login', -1)).resolves.toBeTruthy();
  });

  test('service 维度合法性校验：空值/含非法字符抛错', async () => {
    await expect(ban.disable(UID, '', 60)).rejects.toThrow('service');
    await expect(ban.disable(UID, 'bad service!', 60)).rejects.toThrow('service');
    await expect(ban.untieDisable(UID)).rejects.toThrow('service');
  });
});

describe('checkDisable：403 错误形状（调用方按 code 分支）', () => {
  test('未封禁通过且不抛错', async () => {
    await expect(ban.checkDisable(UID, 'login', 'access')).resolves.toBeUndefined();
  });

  test('被封禁抛 code=ACCOUNT_BANNED + statusCode=403 + details 带服务与剩余时间', async () => {
    await ban.disable(UID, 'login', 120, { reason: '刷单', level: 2 });
    const err = await ban.checkDisable(UID, 'login').catch(e => e);
    expect(err.code).toBe('ACCOUNT_BANNED');
    expect(err.statusCode).toBe(403);
    expect(err.details.service).toBe('login');
    expect(err.details.level).toBe(2);
    expect(err.details.reason).toBe('刷单');
    expect(err.details.remaining).toBeGreaterThan(0);
    expect(err.details.remaining).toBeLessThanOrEqual(120);
  });

  test('多个 service 逐一校验，未封禁的放行', async () => {
    await ban.disable(UID, 'login', 60);
    await expect(ban.checkDisable(UID, 'access', 'comment')).resolves.toBeUndefined();
    await expect(ban.checkDisable(UID, 'login')).rejects.toThrow(/封禁/);
  });
});

describe('阶梯封禁（disableLevel 系列）', () => {
  test('等级写入与查询', async () => {
    await ban.disableLevel(UID, 'comment', 3, 600);
    expect(await ban.getDisableLevel(UID, 'comment')).toBe(3);
    expect(await ban.getDisableLevel(UID, 'other')).toBe(-1);
  });

  test('isDisableLevel：达到阈值真、超过阈值假', async () => {
    await ban.disableLevel(UID, 'comment', 3, 600);
    expect(await ban.isDisableLevel(UID, 'comment', 3)).toBe(true);
    expect(await ban.isDisableLevel(UID, 'comment', 2)).toBe(true);
    expect(await ban.isDisableLevel(UID, 'comment', 4)).toBe(false);
  });

  test('checkDisableLevel：达到阈值抛 ACCOUNT_BAN_LEVEL，未达到通过', async () => {
    await ban.disableLevel(UID, 'comment', 3, 600);
    await expect(ban.checkDisableLevel(UID, 'comment', 4)).resolves.toBeUndefined();
    const err = await ban.checkDisableLevel(UID, 'comment', 2).catch(e => e);
    expect(err.code).toBe('ACCOUNT_BAN_LEVEL');
    expect(err.statusCode).toBe(403);
    expect(err.details.required).toBe(2);
  });

  test('level 参数校验：<1 或非整数抛错', async () => {
    await expect(ban.disableLevel(UID, 'comment', 0, 60)).rejects.toThrow('level');
    await expect(ban.disableLevel(UID, 'comment', 1.5, 60)).rejects.toThrow('level');
  });

  test('普通 disable 后 getDisableLevel 为 0（无等级封禁）', async () => {
    await ban.disable(UID, 'comment', 60);
    expect(await ban.getDisableLevel(UID, 'comment')).toBe(0);
  });
});

describe('事件广播（ACCOUNT_BAN / ACCOUNT_UNTIE）', () => {
  test('封禁与解封都广播对应事件，payload 带明细', async () => {
    const seen = [];
    onAuthEvent(AUTH_EVENTS.ACCOUNT_BAN, p => seen.push({ type: 'ban', p }));
    onAuthEvent(AUTH_EVENTS.ACCOUNT_UNTIE, p => seen.push({ type: 'untie', p }));

    await ban.disable(UID, 'login', 60, { reason: '测试' });
    await ban.untieDisable(UID, 'login');

    expect(seen.map(s => s.type)).toEqual(['ban', 'untie']);
    expect(seen[0].p).toMatchObject({ userId: UID, service: 'login', reason: '测试' });
    expect(seen[0].p.expireAt).toBeGreaterThan(Date.now());
    expect(seen[1].p.services).toEqual(['login']);
  });
});
