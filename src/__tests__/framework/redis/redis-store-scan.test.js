/**
 * `RedisStore` 的 SCAN 相关方法（list / size / destroy / clear）真身测试
 *
 * 背景（2026-10-30，由 CI 的 queue-atomic 关卡在**真 Redis** 上炸出来）：
 * node-redis v5 的 `scan()` 返回的是对象 `{ cursor, keys }`，结束游标是**字符串** `'0'`。
 * 而 `redis-store.js` 里四处 SCAN 循环写的是 v3 时代的形态：
 *
 *   - `const [nextCursor, batch] = await redis.scan(...)` → `TypeError: ... is not iterable`
 *     （`queue-store.clear()` → `RedisStore.destroy()` 直接把进程打挂）；
 *   - `while (cursor !== 0)` → `'0' !== 0` 恒真，list/size 一直扫到总超时才停
 *     （不报错，只是"莫名很慢"）。
 *
 * 为什么单测一直没发现：这些方法只在 **Redis 后端**生效，而测试全都跑在 MapStore 上，
 * 假客户端又习惯性返回数组 —— 假形态永远自洽。这里的假客户端按 v5 的**真实返回形态**
 * （对象 + 字符串游标）分页，并且在 scan 被调用超过 10 次时直接抛错，
 * 让"游标终止条件写错"从"跑满超时"变成一条说清原因的红。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 假客户端的状态（每个用例重置） */
const state = {
  pages: [],
  scanCalls: 0,
  deleted: []
};

const MAX_SCAN_CALLS = 10;

/**
 * 假客户端：`scan` 严格按 v5 的返回形态分页
 * `{ cursor: '0' | '1' | ..., keys: string[] }`，末页游标是字符串 '0'。
 */
const fakeClient = {
  async scan(cursor, options) {
    state.scanCalls++;
    if (state.scanCalls > MAX_SCAN_CALLS) {
      throw new Error(
        `scan 被调用超过 ${MAX_SCAN_CALLS} 次 —— 游标终止条件坏了` +
          '（v5 的结束游标是字符串 "0"，用 `!== 0` 比较永远停不下来）'
      );
    }
    if (typeof cursor !== 'string') {
      throw new Error(`scan 的游标必须是 string，收到 ${typeof cursor}`);
    }
    if (!options || options.MATCH !== 'demo:*') {
      throw new Error(`scan 的 MATCH 参数不对：${options && options.MATCH}`);
    }

    const index = Number(cursor);
    const keys = state.pages[index] || [];
    const hasNext = index + 1 < state.pages.length;

    return { cursor: hasNext ? String(index + 1) : '0', keys };
  },
  async del(keys) {
    state.deleted.push(...keys);
    return keys.length;
  }
};

// 只替换「怎么拿到客户端」这一层：`getRedisClient()` 换成假客户端。
// 注意 `jest.unstable_mockModule` 的工厂**不接收** importOriginal，
// 且不能先 import 真身再 mock（真身会先占据模块缓存，mock 不生效）——
// 所以这里显式列出 redis-store 实际用到的导出。若将来 redis-store 多用了一个
// utils 导出而这里没补，会在调用点直接 `xxx is not a function`（响亮地坏，不会静默）。
jest.unstable_mockModule('../../../framework/redis/utils.js', () => ({
  withTimeout: promise => promise,
  makeKey: (prefix, key) => (prefix ? `${prefix}:${key}` : key),
  getRedisClient: () => fakeClient,
  getBackupRedisClient: () => fakeClient,
  isRedisReady: () => true,
  isBackupRedisReady: () => true,
  isRedisConfigured: () => true,
  isBackupRedisConfigured: () => false,
  safeParse: JSON.parse,
  serialize: JSON.stringify
}));

const { RedisStore } = await import('../../../framework/redis/redis-store.js');

beforeEach(() => {
  state.pages = [];
  state.scanCalls = 0;
  state.deleted = [];
});

describe('RedisStore.list：按 v5 形态消费 SCAN', () => {
  it('跨页聚合，且扫到字符串 "0" 就停（不多扫一轮）', async () => {
    state.pages = [['demo:a', 'demo:b'], ['demo:c']];

    const keys = await RedisStore.list('demo', 0);

    expect(keys).toEqual(['demo:a', 'demo:b', 'demo:c']);
    // 两页 → 恰好两次 scan；若终止条件写成 `!== 0`，这里会一路扫到 10 次并抛错
    expect(state.scanCalls).toBe(2);
  });

  it('limit 生效时立刻收手（不把剩余页扫完）', async () => {
    state.pages = [['demo:a', 'demo:b'], ['demo:c'], ['demo:d']];

    const keys = await RedisStore.list('demo', 2);

    expect(keys).toEqual(['demo:a', 'demo:b']);
    expect(state.scanCalls).toBe(1);
  });
});

describe('RedisStore.size / destroy：同一套 SCOPE 语义', () => {
  it('size 统计所有页的条目数', async () => {
    state.pages = [['demo:a', 'demo:b'], ['demo:c']];

    await expect(RedisStore.size('demo')).resolves.toBe(3);
    expect(state.scanCalls).toBe(2);
  });

  it('destroy 逐页删除并返回删除总数（queue-store.clear 走的就是这条路）', async () => {
    state.pages = [['demo:a', 'demo:b'], ['demo:c']];

    const deleted = await RedisStore.destroy('demo');

    expect(deleted).toBe(3);
    expect(state.deleted.sort()).toEqual(['demo:a', 'demo:b', 'demo:c']);
    expect(state.scanCalls).toBe(2);
  });

  it('clear 与 destroy 语义一致（只清当前前缀）', async () => {
    state.pages = [['demo:a']];

    await expect(RedisStore.clear('demo')).resolves.toBe(1);
    expect(state.deleted).toEqual(['demo:a']);
  });
});
