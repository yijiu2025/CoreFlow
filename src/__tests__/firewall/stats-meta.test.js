/**
 * 统计聚合的路径元数据解析回归（toMeta bug）
 *
 * 真实 bug：`util/redis.js` 的 `readAggregatedStats` 曾直接写
 * `pathMetas?.[key]?.path` —— 但 `store().hgetall` 走 `redis.hGetAll`，
 * **返回原始字符串、不做 safeParse**，对字符串取 `.path` 得 undefined，
 * 聚合视图的 path 静默退化成 apiKey。旧单测用「会自动 JSON.parse 的假
 * store」掩盖了差异（假替身比真身宽松 = 假绿）。
 *
 * 本测试因此**打桩框架层**（framework/redis），让 `util/redis.js` 真身
 * 跑在「返回原始字符串」的假 Redis 上 —— 与 node-redis v5 的真实行为一致。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, test, expect, jest } from '@jest/globals';

/** 模拟 node-redis v5：hGetAll 返回 field → 原始字符串（不做 safeParse） */
const rawHashes = {
  'stats:totals': { requests: '100', blocked: '10' },
  'stats:region': { '广东-深圳': '7' },
  'stats:path': { 'notice.getChannels': '5' },
  // 值是 JSON 字符串 —— 这就是当年被掩盖的关键形态
  'stats:pathmeta': { 'notice.getChannels': JSON.stringify({ path: '/v1/notice/channels', apiName: 'notice.getChannels' }) },
  'stats:ip': { '1.2.3.4': '3' },
  'stats:records': null // 走 call(lRange)
};

const rawRecords = [JSON.stringify({ ip: '8.8.8.8', url: '/old' })];

const fakeClient = {
  lLen: async () => rawRecords.length,
  lRange: async () => rawRecords
};

const fakeStore = {
  hgetall: async key => rawHashes[key] || {},
  call: async fn => fn(fakeClient)
};

jest.unstable_mockModule('../../framework/redis/index.js', () => ({
  getStore: () => fakeStore,
  isRedisReady: () => true
}));

const { readAggregatedStats } = await import('../../app/firewall/util/redis.js');

describe('readAggregatedStats 元数据解析（真身 + 原始字符串假 Redis）', () => {
  test('pathMeta 原始 JSON 字符串必须被解析，path 不得退化成 apiKey', async () => {
    const stats = await readAggregatedStats({ recordLimit: 10 });

    expect(stats).not.toBeNull();
    expect(stats.totals).toEqual({ requests: 100, blocked: 10 });

    const entry = stats.paths.find(p => p.key === 'notice.getChannels');
    expect(entry).toBeDefined();
    // 回归点：旧实现对字符串取 .path 得 undefined → path 退化成 key
    expect(entry.path).toBe('/v1/notice/channels');
    expect(entry.apiName).toBe('notice.getChannels');
    expect(entry.count).toBe(5);

    expect(stats.regions).toEqual([{ region: '广东-深圳', count: 7 }]);
    expect(stats.ips).toEqual([{ ip: '1.2.3.4', count: 3 }]);
    expect(stats.recordCount).toBe(1);
    expect(stats.records).toEqual([{ ip: '8.8.8.8', url: '/old' }]);
  });

  test('损坏的 JSON 元数据不炸读取：path 退回 key（容错分支）', async () => {
    rawHashes['stats:pathmeta'] = { 'notice.getChannels': '{broken json' };
    try {
      const stats = await readAggregatedStats({ recordLimit: 10 });
      const entry = stats.paths.find(p => p.key === 'notice.getChannels');
      expect(entry.path).toBe('notice.getChannels');
      expect(entry.apiName).toBeNull();
    } finally {
      rawHashes['stats:pathmeta'] = {
        'notice.getChannels': JSON.stringify({ path: '/v1/notice/channels', apiName: 'notice.getChannels' })
      };
    }
  });

  test('上游若改为对象（safeParse 形态）同样可用（容错分支）', async () => {
    const original = rawHashes['stats:pathmeta'];
    rawHashes['stats:pathmeta'] = {
      'notice.getChannels': { path: '/v1/notice/channels', apiName: 'notice.getChannels' }
    };
    try {
      const stats = await readAggregatedStats({ recordLimit: 10 });
      expect(stats.paths[0].path).toBe('/v1/notice/channels');
    } finally {
      rawHashes['stats:pathmeta'] = original;
    }
  });
});
