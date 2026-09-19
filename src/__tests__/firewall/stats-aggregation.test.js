/**
 * 跨实例统计汇聚（E3b）—— data/store.js 层单测
 *
 * 打桩点选在语义化访问层（`app/firewall/util/redis.js`），store.js 的
 * 增量维护 / 合并 / 降级逻辑全部跑真身：
 *   - 增量刷写必须「批量一次」且失败时原样放回（不丢也不重复计）；
 *   - 聚合读取 = Redis 全量 + 本实例未刷写增量（键按 apiIdentifier 对齐）；
 *   - Redis 不可用/读取失败时退回本实例视图（降级不报错）。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const flushStatsDelta = jest.fn(async () => true);
const readAggregatedStats = jest.fn(async () => null);
const resetAggregatedStats = jest.fn(async () => true);
const redisAvailableMock = jest.fn(() => true);

jest.unstable_mockModule('../../app/firewall/util/redis.js', () => ({
  flushStatsDelta: (...a) => flushStatsDelta(...a),
  readAggregatedStats: (...a) => readAggregatedStats(...a),
  resetAggregatedStats: (...a) => resetAggregatedStats(...a),
  redisAvailable: (...a) => redisAvailableMock(...a),
  store: jest.fn(),
  full: k => `fw:${k}`
}));

// store.js 在模块加载期 loadData()：必须先指到临时文件，避免碰被 git 跟踪的
// src/data/traffic_stats.json
process.env.FW_TRAFFIC_STATS_FILE = path.join(os.tmpdir(), `fw-store-test-${process.pid}.json`);

const store = await import('../../app/firewall/data/store.js');

function makeRecord(over = {}) {
  return {
    time: new Date().toISOString(),
    ip: '10.0.0.1',
    method: 'GET',
    url: '/v1/notice/channels',
    region: '广东',
    city: '深圳',
    blocked: false,
    ...over
  };
}

const remoteStats = () => ({
  totals: { requests: 100, blocked: 10 },
  regions: [{ region: '浙江-杭州', count: 40 }],
  paths: [{ key: 'notice.getChannels', path: '/v1/notice/channels', count: 30, apiName: 'notice.getChannels' }],
  ips: [{ ip: '8.8.8.8', count: 25 }],
  recordCount: 2,
  records: [{ ip: '8.8.8.8', url: '/old' }, { ip: '8.8.4.4', url: '/older' }]
});

beforeEach(async () => {
  redisAvailableMock.mockReturnValue(true);
  flushStatsDelta.mockResolvedValue(true);
  readAggregatedStats.mockResolvedValue(null);
  resetAggregatedStats.mockResolvedValue(true);
  await store.clearAll(); // 复位 store 模块状态（本身会调一次 resetAggregatedStats）
  jest.clearAllMocks(); // 之后再清计数，用例内的断言不受 beforeEach 影响
});

describe('统计增量刷写', () => {
  test('pushRecord 累加增量，flushPersist 把整批增量一次交给访问层', async () => {
    store.pushRecord(makeRecord({ ip: '10.0.0.1', apiKey: 'notice.getChannels' }));
    store.pushRecord(makeRecord({ ip: '10.0.0.2', blocked: true, url: '/api/x' }));
    store.pushRecord(makeRecord({ ip: '10.0.0.1', apiKey: 'notice.getChannels' }));

    await store.flushPersist();

    expect(flushStatsDelta).toHaveBeenCalledTimes(1);
    const delta = flushStatsDelta.mock.calls[0][0];
    expect(delta.requests).toBe(3);
    expect(delta.blocked).toBe(1);
    expect(delta.records).toHaveLength(3);
    expect(delta.ips.get('10.0.0.1')).toBe(2);
    expect(delta.ips.get('10.0.0.2')).toBe(1);
    expect(delta.paths.get('notice.getChannels').count).toBe(2);
    expect(delta.paths.get('/api/x').count).toBe(1);
    // 记录保持时间正序（LPUSH 语义的对接约定）
    expect(delta.records[2].ip).toBe('10.0.0.1');
  });

  test('刷写成功后增量清空，重复 flush 不产生第二次写入', async () => {
    store.pushRecord(makeRecord());
    await store.flushPersist();
    await store.flushPersist();
    expect(flushStatsDelta).toHaveBeenCalledTimes(1);
  });

  test('刷写失败时增量原样放回，下次继续携带', async () => {
    flushStatsDelta.mockResolvedValueOnce(false);
    store.pushRecord(makeRecord({ ip: '10.1.1.1' }));
    await store.flushPersist();

    const first = flushStatsDelta.mock.calls[0][0];
    expect(first.requests).toBe(1);

    store.pushRecord(makeRecord({ ip: '10.1.1.2' }));
    await store.flushPersist();

    const second = flushStatsDelta.mock.calls[1][0];
    expect(second.requests).toBe(2); // 失败的 1 条 + 新的 1 条
    expect(second.ips.get('10.1.1.1')).toBe(1);
  });

  test('Redis 不可用时不维护增量也不调度刷写', async () => {
    redisAvailableMock.mockReturnValue(false);
    store.pushRecord(makeRecord());
    await store.flushPersist();
    expect(flushStatsDelta).not.toHaveBeenCalled();
  });
});

describe('聚合读取（Redis 全量 + 未刷写增量）', () => {
  test('汇总 = 远端全量 + 本实例增量，路径按 apiIdentifier 键对齐', async () => {
    readAggregatedStats.mockResolvedValue(remoteStats());
    store.pushRecord(makeRecord({ region: '北京', city: '朝阳', apiKey: 'notice.getChannels' }));

    const summary = await store.getSummaryAggregated();

    expect(summary.totalRequests).toBe(101);
    expect(summary.totalBlocked).toBe(10);
    const regions = Object.fromEntries(summary.topRegions.map(r => [r.region, r.count]));
    expect(regions['浙江-杭州']).toBe(40);
    expect(regions['北京-朝阳']).toBe(1);
    // 同一 apiIdentifier 不会算成两条
    const paths = Object.fromEntries(summary.topPaths.map(p => [p.path, p.count]));
    expect(paths['/v1/notice/channels']).toBe(31);
  });

  test('最近记录：未刷写增量比 Redis 已刷写的都新，排在最前', async () => {
    readAggregatedStats.mockResolvedValue(remoteStats());
    store.pushRecord(makeRecord({ ip: '9.9.9.9', url: '/newest' }));

    const records = await store.getRecentRecordsAggregated(3);

    expect(records).toHaveLength(3);
    expect(records[0].url).toBe('/newest');
    expect(records[1].url).toBe('/old');
  });

  test('读取失败/Redis 不可用退回本实例视图', async () => {
    redisAvailableMock.mockReturnValue(false);
    store.pushRecord(makeRecord());
    const local = await store.getSummaryAggregated();
    expect(local.totalRequests).toBe(1);

    redisAvailableMock.mockReturnValue(true);
    readAggregatedStats.mockResolvedValue(null);
    const fallback = await store.getSummaryAggregated();
    expect(fallback.totalRequests).toBe(store.getSummary().totalRequests);
  });
});

describe('清空', () => {
  test('clearAll 同步清空本地并复位 Redis 聚合键', async () => {
    store.pushRecord(makeRecord());
    await store.clearAll();
    expect(resetAggregatedStats).toHaveBeenCalledTimes(1);
    expect(store.getSummary().totalRequests).toBe(0);
    expect(store.getRecentRecords()).toHaveLength(0);
  });
});
