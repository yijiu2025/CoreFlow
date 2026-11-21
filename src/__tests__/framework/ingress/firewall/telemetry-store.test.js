/**
 * 防火墙遥测存储（framework 层）真实驱动测试
 *
 * 被测对象：`framework/ingress/firewall/telemetry/store.js`
 * 驱动方式：启动真实的接收器 → 通过 `telemetry-sink` 的真实入口投递记录 →
 * 断言累计值、环形上限、落盘与重启续算。**不手写常量自测**。
 *
 * 落盘路径用 `FW_TRAFFIC_STATS_FILE` 指到临时目录：默认路径是仓库根的
 * `data/traffic_stats.json`，测试若写它就会把真实累计计数覆盖成夹具数据。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-telemetry-'));
const STATS_FILE = path.join(TMP_DIR, 'traffic_stats.json');

// 必须在 import store 之前设置：模块加载期就会解析目标路径
process.env.FW_TRAFFIC_STATS_FILE = STATS_FILE;

const store = await import('../../../../framework/ingress/firewall/telemetry/store.js');
const { recordFirewallEvent } = await import('../../../../framework/ingress/firewall/telemetry-sink.js');

afterAll(() => {
  store.stopTelemetry();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('遥测接收：计数器与环形明细', () => {
  beforeAll(() => {
    store.startTelemetry();
  });

  test('startTelemetry 真的把 sink 接上了（引擎投递 → 计数增长）', () => {
    const before = store.getSummary();
    recordFirewallEvent({ url: '/v1/health', blocked: false });
    recordFirewallEvent({ url: '/admin/v1/users', blocked: true, statusCode: 403 });

    const after = store.getSummary();
    expect(after.totalRequests).toBe(before.totalRequests + 2);
    expect(after.totalBlocked).toBe(before.totalBlocked + 1);
    expect(after.bufferedCount).toBeGreaterThanOrEqual(2);
  });

  test('明细是环形缓冲：超出上限只保留尾部，累计计数不丢', () => {
    const total = store.getSummary().totalRequests;
    const overflow = store.MAX_RECORDS + 30;

    for (let i = 0; i < overflow; i += 1) {
      recordFirewallEvent({ url: `/flood/${i}`, blocked: false });
    }

    const summary = store.getSummary();
    expect(summary.bufferedCount).toBe(store.MAX_RECORDS);
    expect(summary.totalRequests).toBe(total + overflow);
    // 尾部是最新一条，头部已经滚掉
    expect(store.getRecentRecords(1)[0].url).toBe(`/flood/${overflow - 1}`);
    expect(store.getRecentRecords()).toHaveLength(store.MAX_RECORDS);
  });

  test('非对象记录被忽略（单条坏数据不影响计数）', () => {
    const before = store.getSummary().totalRequests;
    recordFirewallEvent(null);
    recordFirewallEvent('not-an-object');
    expect(store.getSummary().totalRequests).toBe(before);
  });
});

describe('持久化：原子写 + 重启续算', () => {
  test('flush 创建完整可解析的 JSON，且不残留临时文件', () => {
    expect(store.flush()).toBe(true);
    const raw = fs.readFileSync(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    const summary = store.getSummary();
    expect(parsed.totalRequests).toBe(summary.totalRequests);
    expect(parsed.totalBlocked).toBe(summary.totalBlocked);
    expect(parsed.records).toHaveLength(summary.bufferedCount);
    expect(typeof parsed.updatedAt).toBe('string');

    expect(fs.existsSync(`${STATS_FILE}.tmp`)).toBe(false);
  });

  test('再次 flush 是替换而非原地追加（内容始终是一份完整快照）', () => {
    const firstSize = fs.statSync(STATS_FILE).size;
    recordFirewallEvent({ url: '/after-first-flush', blocked: false });
    expect(store.flush()).toBe(true);

    const second = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    expect(second.totalRequests).toBe(store.getSummary().totalRequests);
    expect(second.records.at(-1).url).toBe('/after-first-flush');
    // 快照大小随条目增加或持平（环形满后会持平），不会累积成两份
    expect(fs.statSync(STATS_FILE).size).toBeGreaterThanOrEqual(firstSize);
  });

  test('重启续算：复位内存后从磁盘恢复计数与明细', () => {
    expect(store.flush()).toBe(true);
    const before = store.getSummary();

    store.resetTelemetry();
    expect(store.getSummary()).toEqual({
      totalRequests: 0,
      totalBlocked: 0,
      bufferedCount: 0,
      recordLimit: store.MAX_RECORDS
    });

    store.hydrate();
    const after = store.getSummary();
    expect(after.totalRequests).toBe(before.totalRequests);
    expect(after.totalBlocked).toBe(before.totalBlocked);
    expect(after.bufferedCount).toBe(before.bufferedCount);
  });

  test('文件损坏时从零开始而不是抛错（遥测不能阻断启动）', () => {
    fs.writeFileSync(STATS_FILE, '{ this is not json', 'utf-8');
    store.resetTelemetry();
    expect(() => store.hydrate()).not.toThrow();
    expect(store.getSummary().totalRequests).toBe(0);
  });
});
