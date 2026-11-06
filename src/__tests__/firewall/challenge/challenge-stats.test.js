/**
 * 挑战指标在统计层的行为：写入 / 读取 / 清空
 *
 * 打桩方式照 `stats-meta.test.js`：桩**框架层 redis**，让 `util/redis.js` 真身跑，
 * 这样 `full()` 前缀、`store().call(client => …)` 的调用形态都是真的，
 * 断言才不会被"比真身宽松的假 store"骗过。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

/** 最近一次 MULTI 里的操作（断言用） */
let ops = [];

/** 假 Redis 里的 hash（field → 原始字符串，与 node-redis v5 的 hGetAll 一致） */
const hashes = {
  'stats:totals': { requests: '10', blocked: '1' },
  'stats:challenge': {
    'issued:pow': '20',
    'verified:pow': '15',
    'failed:Challenge Expired': '5',
    'solveMs:b0': '10',
    'solveMs:b1': '5',
    'surface:inline': '3',
    'surface:page': '12',
    'difficulty:3': '20'
  }
};

const fakeClient = {
  multi() {
    const pipe = {
      hIncrBy(key, field, value) {
        ops.push(['hIncrBy', key, field, value]);
        return pipe;
      },
      hSetNX(key, field, value) {
        ops.push(['hSetNX', key, field, value]);
        return pipe;
      },
      lPush(key, value) {
        ops.push(['lPush', key, value]);
        return pipe;
      },
      lTrim(key, a, b) {
        ops.push(['lTrim', key, a, b]);
        return pipe;
      },
      del(key) {
        ops.push(['del', key]);
        return pipe;
      },
      exec: async () => []
    };
    return pipe;
  },
  lLen: async () => 0,
  lRange: async () => []
};

const fakeStore = {
  hgetall: async key => hashes[key] || {},
  call: async fn => fn(fakeClient)
};

jest.unstable_mockModule('../../../framework/redis/index.js', () => ({
  getStore: () => fakeStore,
  isRedisReady: () => true
}));

const { flushStatsDelta, readAggregatedStats, resetAggregatedStats } =
  await import('../../../app/firewall/data/stats-redis.js');
const { full } = await import('../../../framework/firewall/util/redis.js');

/** 造一份空增量（把必填字段补齐） */
function emptyDelta() {
  return {
    requests: 0,
    blocked: 0,
    regions: new Map(),
    paths: new Map(),
    ips: new Map(),
    records: []
  };
}

beforeEach(() => {
  ops = [];
});

describe('写入：挑战计数走独立 hash', () => {
  test('只有挑战增量（没有流量增量）也会刷写', async () => {
    const ok = await flushStatsDelta({ ...emptyDelta(), challenge: { 'issued:pow': 2, 'verified:pow': 1 } });
    expect(ok).toBe(true);
    expect(ops).toEqual([
      ['hIncrBy', full('stats:challenge'), 'issued:pow', 2],
      ['hIncrBy', full('stats:challenge'), 'verified:pow', 1]
    ]);
  });

  test('非正增量不写（避免 0 值刷出空操作）', async () => {
    await flushStatsDelta({ ...emptyDelta(), challenge: { 'issued:pow': 0, 'verified:pow': -3 } });
    expect(ops).toEqual([]);
  });

  test('挑战增量与流量增量同一次 MULTI 提交（不多一次往返）', async () => {
    await flushStatsDelta({
      ...emptyDelta(),
      requests: 3,
      regions: new Map([['广东-深圳', 3]]),
      challenge: { 'failed:Invalid Proof': 1 }
    });
    const keys = ops.map(o => o[1]);
    expect(keys).toContain(full('stats:totals'));
    expect(keys).toContain(full('stats:region'));
    expect(keys).toContain(full('stats:challenge'));
  });
});

describe('读取：聚合视图带挑战汇总与原始字段', () => {
  test('challenge 是汇总，challengeFields 是原始 field（合并本地增量要用后者）', async () => {
    const stats = await readAggregatedStats({ recordLimit: 0 });
    expect(stats.challenge).toMatchObject({
      issued: 20,
      verified: 15,
      failed: 5,
      successRate: 0.75, // 15 / (15 + 5)
      bySurface: { inline: 3, page: 12 },
      byDifficulty: { 3: 20 }
    });
    expect(stats.challenge.reasons).toEqual({ 'Challenge Expired': 5 });
    expect(stats.challenge.solveMs.samples).toBe(15);
    // 原始字段必须原样给出来（数值是字符串，由调用方 Number 化）
    expect(stats.challengeFields['issued:pow']).toBe('20');
  });

  test('Redis 里没有挑战数据时给全零结构，而不是 undefined', async () => {
    const backup = hashes['stats:challenge'];
    hashes['stats:challenge'] = {};
    try {
      const stats = await readAggregatedStats({ recordLimit: 0 });
      expect(stats.challenge).toMatchObject({ issued: 0, verified: 0, failed: 0, successRate: null });
    } finally {
      hashes['stats:challenge'] = backup;
    }
  });
});

describe('清空：挑战 hash 也在清扫范围内', () => {
  test('resetAggregatedStats 会删掉 stats:challenge', async () => {
    await resetAggregatedStats();
    const deleted = ops.filter(o => o[0] === 'del').map(o => o[1]);
    expect(deleted).toContain(full('stats:challenge'));
  });
});
