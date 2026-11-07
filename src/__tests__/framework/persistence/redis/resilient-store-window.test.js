/**
 * ResilientStore 限流计数的窗口语义
 *
 * 钉住两件事（2026-11-02 修的两处真缺陷）：
 *   1. **窗口以插件传入的 `timeWindow` 为准**（路由级 `config.rateLimit.timeWindow`）。
 *      历史实现完全忽略这个参数、只用 `getWindowMs()` 的全局配置，
 *      于是路由上声明 `timeWindow: '10 minutes'` 实际仍是 60 秒 —— 参数是装饰品。
 *   2. **只在窗口创建时设过期**。历史实现每个请求都 `PEXPIRE`，TTL 被不断续期，
 *      客户端持续重试就永远不归零 → 限流退化成「一旦超限就永久 429」。
 *
 * 本文件只构造 store（不连真 Redis）：Redis 路径用一个假的 `eval` 接住参数，
 * 断言窗口确实透传进 Lua；内存降级路径直接查 `memoryFallback` 的 expires。
 *
 * @author yijiu2025
 * @since 2026-11-02
 */
import { describe, it, expect } from '@jest/globals';

import { ResilientStore } from '../../../../framework/persistence/redis/resilient-store.js';

/** 静默 logger：store 内部会 debug/info/warn */
const log = { debug() {}, info() {}, warn() {}, error() {} };

/** 内存模式（Redis 不可用）的假 app */
function memoryApp() {
  return { redis: null, redisHealthy: false, log, addHook() {} };
}

/** Redis 模式的假 app：eval 由用例注入 */
function redisApp(evalImpl) {
  return { redis: { eval: evalImpl }, redisHealthy: true, log, addHook() {} };
}

/** 包一层回调为 Promise */
const incr = (store, key, timeWindow) =>
  new Promise((resolve, reject) => {
    store.incr(key, (err, res) => (err ? reject(err) : resolve(res)), timeWindow);
  });

describe('ResilientStore.incr：窗口来源', () => {
  it('内存降级：用路由传入的 timeWindow，而不是全局 getWindowMs', async () => {
    const store = new ResilientStore(memoryApp(), { getWindowMs: () => 60_000 });

    const before = Date.now();
    const res = await incr(store, 'k:route-window', 5_000);

    expect(res.current).toBe(1);
    const record = store.memoryFallback.get('k:route-window');
    // 窗口必须是 5s（允许几毫秒误差），不能是全局的 60s
    expect(record.expires - before).toBeLessThanOrEqual(5_050);
    expect(record.expires - before).toBeGreaterThan(4_000);
  });

  it('内存降级：未传 timeWindow 时回退全局窗口', async () => {
    const store = new ResilientStore(memoryApp(), { getWindowMs: () => 60_000 });

    const before = Date.now();
    await incr(store, 'k:global-window');

    const record = store.memoryFallback.get('k:global-window');
    expect(record.expires - before).toBeGreaterThan(59_000);
  });

  it('内存降级：非法 timeWindow（0 / NaN）一律回退全局窗口', async () => {
    const store = new ResilientStore(memoryApp(), { getWindowMs: () => 60_000 });

    for (const [key, bad] of [
      ['k:zero', 0],
      ['k:nan', Number.NaN],
      ['k:negative', -1]
    ]) {
      const before = Date.now();
      await incr(store, key, bad);
      const record = store.memoryFallback.get(key);
      expect(record.expires - before).toBeGreaterThan(59_000);
    }
  });

  it('内存降级：窗口内不续期（第二次计数不会重置过期时间）', async () => {
    const store = new ResilientStore(memoryApp(), { getWindowMs: () => 60_000 });

    await incr(store, 'k:no-refresh', 5_000);
    const first = store.memoryFallback.get('k:no-refresh').expires;
    await incr(store, 'k:no-refresh', 5_000);
    const second = store.memoryFallback.get('k:no-refresh').expires;

    // 计数递增，但过期时间不动 —— 否则持续重试会让窗口永不结束
    expect(store.memoryFallback.get('k:no-refresh').count).toBe(2);
    expect(second).toBe(first);
  });

  it('Redis 路径：路由窗口透传给 Lua，并采用 Lua 返回的 ttl', async () => {
    const calls = [];
    const store = new ResilientStore(
      redisApp(async (script, opts) => {
        calls.push({ script, opts });
        return [3, 4200];
      }),
      { getWindowMs: () => 60_000 }
    );

    const res = await incr(store, 'rate:ip:1.2.3.4h5-token', 9_000);

    expect(res).toEqual({ current: 3, ttl: 4200 });
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.keys).toEqual(['rate:ip:1.2.3.4h5-token']);
    // 9s 而非全局 60s
    expect(calls[0].opts.arguments).toEqual(['9000']);
  });
});
