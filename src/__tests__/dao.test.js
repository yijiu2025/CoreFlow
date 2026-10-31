/**
 * OAuth 刷新令牌 DAO 契约（真实模块驱动）
 *
 * ⚠️ 为什么重写：旧版本通篇是「手写一个对象字面量 → 断言它有 xxx 字段」，
 * 完全没有 import 任何 DAO —— 把 `src/app/oauth21/dao/` 整个删掉它也全绿。
 * 它之所以能通过 test-effectiveness 守卫，只是因为在最后一个用例里
 * `await import('crypto')`（内建模块）。
 *
 * 现在直接驱动真身 `TokenDao`，用替身 model 记录 Sequelize 的调用参数，
 * 锁住三条真正要命的安全语义：
 *   1. **refresh_token 必须以 sha256 哈希入库** —— 明文入库意味着一次拖库即可直接登录；
 *   2. **find 必须同时带 `revoked: false` 与 `expires_at > now`** ——
 *      少任何一个都会让已吊销/已过期的令牌继续换发 access token；
 *   3. **revoke 是逻辑吊销（update revoked=true），不是物理删除** ——
 *      删了就失去了「已吊销令牌再次出现 = 被盗用」这条检测能力。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-31 改为真身驱动（此前为纯常量自证，生产代码零覆盖）
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'node:crypto';

/** 替身 OauthToken 模型：只记录调用，不碰数据库 */
const modelCalls = [];
const modelResult = { row: null };

const noop = async () => {};

function makeFakeModel() {
  return {
    create: async payload => {
      modelCalls.push({ op: 'create', payload });
      return { toJSON: () => payload, ...{} };
    },
    findOne: async options => {
      modelCalls.push({ op: 'findOne', options });
      const row = modelResult.row;
      return row ? { toJSON: () => row } : null;
    },
    update: async (values, options) => {
      modelCalls.push({ op: 'update', values, options });
      return [1];
    },
    destroy: async options => {
      modelCalls.push({ op: 'destroy', options });
      return 3;
    },
    noop
  };
}

jest.unstable_mockModule('../framework/db/index.js', () => {
  const OauthToken = makeFakeModel();
  return {
    default: { models: { OauthToken } },
    getModel: name => (name === 'OauthToken' ? OauthToken : null),
    sequelize: { models: { OauthToken } }
  };
});

const { default: TokenDao } = await import('../app/oauth21/dao/token.dao.js');

/** 生产侧使用的哈希算法（与 token.dao.js 的 rtHash 同构） */
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

const PLAIN_RT = 'plain-refresh-token-value-abc123';

beforeEach(() => {
  modelCalls.length = 0;
  modelResult.row = null;
});

describe('TokenDao.save：明文绝不入库', () => {
  it('入库的是 sha256 哈希，不是明文', async () => {
    await TokenDao.save(PLAIN_RT, { sub: 'user-1', client_id: 'firewall', scope: 'openid', expiresIn: 600 });

    const call = modelCalls.find(c => c.op === 'create');
    expect(call).toBeDefined();

    const stored = call.payload.refresh_token;
    expect(stored).not.toBe(PLAIN_RT);
    expect(stored).not.toContain(PLAIN_RT);
    expect(stored).toBe(sha256(PLAIN_RT));
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });

  it('默认未吊销，且 expires_at 落在 expiresIn 之后', async () => {
    const before = Date.now();
    await TokenDao.save(PLAIN_RT, { sub: 'user-1', client_id: 'firewall', expiresIn: 600 });
    const { payload } = modelCalls.find(c => c.op === 'create');

    expect(payload.revoked).toBe(false);
    expect(payload.sub).toBe('user-1');
    expect(payload.client_id).toBe('firewall');
    const delta = payload.expires_at.getTime() - before;
    expect(delta).toBeGreaterThan(590_000);
    expect(delta).toBeLessThan(620_000);
  });

  it('未传 expiresIn 时默认 24 小时', async () => {
    const before = Date.now();
    await TokenDao.save(PLAIN_RT, { sub: 'user-1', client_id: 'firewall' });
    const { payload } = modelCalls.find(c => c.op === 'create');
    const delta = payload.expires_at.getTime() - before;
    expect(delta).toBeGreaterThan(86_000_000);
    expect(delta).toBeLessThan(86_500_000);
  });
});

describe('TokenDao.find：必须同时排除已吊销与已过期', () => {
  it('用哈希查询，且条件带 revoked:false + expires_at 下界', async () => {
    await TokenDao.find(PLAIN_RT);

    const { options } = modelCalls.find(c => c.op === 'findOne');
    expect(options.where.refresh_token).toBe(sha256(PLAIN_RT));
    expect(options.where.revoked).toBe(false);
    // expires_at 必须是「大于当前时间」的条件对象（Sequelize 的 Op.gt 是 Symbol，
    // 所以要用 getOwnPropertySymbols 取；只写 Object.keys 会得到空数组而假绿）
    expect(options.where.expires_at).toBeDefined();
    const expSymbols = Object.getOwnPropertySymbols(options.where.expires_at);
    expect(expSymbols.length).toBe(1);
    const boundary = options.where.expires_at[expSymbols[0]];
    expect(boundary).toBeInstanceOf(Date);
    expect(boundary.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('命中时返回 toJSON 结果，未命中返回 null', async () => {
    modelResult.row = { sub: 'user-1', client_id: 'firewall', revoked: false };
    expect(await TokenDao.find(PLAIN_RT)).toMatchObject({ sub: 'user-1', client_id: 'firewall' });

    modelResult.row = null;
    expect(await TokenDao.find(PLAIN_RT)).toBeNull();
  });
});

describe('TokenDao.revoke：逻辑吊销，不物理删除', () => {
  it('只把 revoked 置 true，绝不出现在 destroy 调用里', async () => {
    await TokenDao.revoke(PLAIN_RT);

    const update = modelCalls.find(c => c.op === 'update');
    expect(update.values).toEqual({ revoked: true });
    expect(update.options.where.refresh_token).toBe(sha256(PLAIN_RT));
    expect(modelCalls.some(c => c.op === 'destroy')).toBe(false);
  });

  it('findRevoked 不带 revoked 过滤（否则"已吊销令牌再次出现"永远检测不到）', async () => {
    await TokenDao.findRevoked(PLAIN_RT);

    const { options } = modelCalls.find(c => c.op === 'findOne');
    expect(options.where.refresh_token).toBe(sha256(PLAIN_RT));
    expect('revoked' in options.where).toBe(false);
  });

  it('revokeAllForUser / revokeAllForClient 按对应维度批量吊销', async () => {
    await TokenDao.revokeAllForUser('user-9');
    await TokenDao.revokeAllForClient('firewall');

    const updates = modelCalls.filter(c => c.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0].values).toEqual({ revoked: true });
    expect(updates[0].options.where).toEqual({ sub: 'user-9' });
    expect(updates[1].options.where).toEqual({ client_id: 'firewall' });
  });
});

describe('TokenDao.cleanup：只清过期与已吊销', () => {
  it('条件必须是 OR(过期, 已吊销)——把未过期且未吊销的删掉等于随机踢人下线', async () => {
    await TokenDao.cleanup();

    const { options } = modelCalls.find(c => c.op === 'destroy');
    const orSymbol = Object.getOwnPropertySymbols(options.where)[0];
    const or = options.where[orSymbol];
    expect(Array.isArray(or)).toBe(true);
    expect(or).toHaveLength(2);

    const hasRevokedClause = or.some(c => c.revoked === true);
    const hasExpiredClause = or.some(c => c.expires_at !== undefined);
    expect(hasRevokedClause).toBe(true);
    expect(hasExpiredClause).toBe(true);
  });
});
