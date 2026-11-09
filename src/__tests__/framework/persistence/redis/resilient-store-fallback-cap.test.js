/**
 * 限流降级表（memoryFallback）的容量护栏
 *
 * 这是**降级模式下的内存攻击面**：Redis 不可用时计数落在内存 Map 上，键是
 * `rate:ip:<ip>` / `rate:user:<id>`；IPv6 一个 /64 就有 2^64 个地址，轮换地址
 * 能让这张表无上限增长（≈200B/键）。满了之后只有两种处理方式，选错代价很不一样：
 *
 *   · 淘汰最旧（capMapSize 那套）：删掉某个键 = 它的计数清零 = 下一请求从 0 开始数，
 *     攻击者打满表就能让所有人的限流窗口反复重置 —— **限流被绕过**；
 *   · 拒绝新键（本实现）：新来源直接判超限，**已有键的计数一概不动** —— 误伤新用户，
 *     但保护不被绕过。
 *
 * 因此这里钉住三件事：超限只拦新键、已有计数不被清零、过期条目仍能被回收。
 *
 * @author yijiu2025
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ResilientStore } from '../../../../framework/persistence/redis/resilient-store.js';

const WINDOW = 60_000;
/** 该路由的窗口上限（插件第 4 个参数），用来构造"已超限"的返回值 */
const MAX = 10;

/** 只提供 store 需要的字段：无 Redis（强制走内存）、无 addHook（不注册 onClose） */
function makeApp() {
  return {
    redisHealthy: false,
    redis: null,
    log: { warn() {}, info() {}, debug() {}, error() {} }
  };
}

function makeStore(cap) {
  return new ResilientStore(makeApp(), { getWindowMs: () => WINDOW, getMaxKeys: () => cap });
}

/** incr 的 Promise 包装（内存路径同步回调） */
function incr(store, key) {
  return new Promise((resolve, reject) => {
    store.incr(key, (err, res) => (err ? reject(err) : resolve(res)), WINDOW, MAX);
  });
}

describe('降级表容量护栏', () => {
  let store;

  beforeEach(() => {
    store = makeStore(3);
  });

  afterEach(() => {
    store.close();
  });

  it('未超限时就是普通计数（同键累加、不同键各算各的）', async () => {
    expect((await incr(store, 'k1')).current).toBe(1);
    expect((await incr(store, 'k1')).current).toBe(2);
    expect((await incr(store, 'k2')).current).toBe(1);
    expect(store.usage().used).toBe(2);
  });

  it('🔴 满了以后拒绝**新键**：返回 current > max（插件据此判超限 → 429）', async () => {
    for (const key of ['k1', 'k2', 'k3']) await incr(store, key);
    expect(store.usage().used).toBe(3);

    const rejected = await incr(store, 'k4');
    expect(rejected.current).toBeGreaterThan(MAX);
    // 被拒的键不落表（否则表还会继续长）
    expect(store.usage().used).toBe(3);
    expect(store.memoryFallback.has('k4')).toBe(false);
  });

  it('🔴 已有键的计数绝不被清零（拒绝 ≠ 淘汰）', async () => {
    for (const key of ['k1', 'k2', 'k3']) await incr(store, key);
    await incr(store, 'k1'); // k1 → 2
    await incr(store, 'k5'); // 被拒

    // k1 仍是 2 → 3；如果实现是"淘汰最旧"，k1 会被删掉、这里会回到 1
    expect((await incr(store, 'k1')).current).toBe(3);
  });

  it('超限但表里有**过期**条目时：先清过期再放行新键（纯收益，不动活计数）', async () => {
    for (const key of ['k1', 'k2', 'k3']) await incr(store, key);

    // 让其中一条过期（模拟窗口结束），并把时钟推过清理节流间隔
    const base = Date.now();
    store.memoryFallback.get('k1').expires = base - 1;

    jest.useFakeTimers();
    jest.setSystemTime(base + 5_000);
    try {
      const accepted = await incr(store, 'k4');
      expect(accepted.current).toBe(1);
      expect(store.memoryFallback.has('k1')).toBe(false); // 过期项被回收
      expect(store.memoryFallback.has('k4')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('usage() 给出容量与占比（面板可观测，不再恒为 null）', async () => {
    await incr(store, 'k1');
    const usage = store.usage();

    expect(usage.capacity).toBe(3);
    expect(usage.used).toBe(1);
    expect(usage.free).toBe(2);
    expect(usage.percent).toBeCloseTo(33.3, 1);
  });

  it('容量配置缺失/非法时回退默认值（不能变成 0 或 Infinity）', () => {
    for (const bad of [undefined, 0, -1, Number.NaN, 'abc']) {
      const s = new ResilientStore(makeApp(), { getWindowMs: () => WINDOW, getMaxKeys: () => bad });
      expect(s.usage().capacity).toBe(100_000);
      s.close();
    }
  });

  it('child() 继承容量配置（路由桶与父实例同一张表、同一上限）', () => {
    const child = store.child();
    expect(child.usage().capacity).toBe(3);
    expect(child.memoryFallback).toBe(store.memoryFallback);
    child.close();
  });
});
