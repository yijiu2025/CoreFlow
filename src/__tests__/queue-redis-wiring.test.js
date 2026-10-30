/**
 * Queue / RingQueue 的 Redis 后端**接线契约**测试
 *
 * ⚠️ 这里刻意不测 Lua 语义。真正的多实例语义由跨进程关卡
 * `scripts/verify/queue-atomic.mjs`（真 Redis + 真多进程）覆盖；在 jest 里用
 * 假 Redis 复刻一遍脚本逻辑，只会得到一份"和实现一起写错"的复制品。
 *
 * 本文件锁的是**回归形状**——即 2026-10-30 之前那两个静默故障的写法特征：
 *
 *   1. 变更操作（push / shift）必须**只发一次 EVAL**，不再出现
 *      「读 meta 到进程内变量 → 改 → `store.set('meta', …)` 写回」。
 *      只要写回存在，多实例下 stale tail 就会覆盖别人的消息，队列指针倒退。
 *   2. EVAL 的 KEYS 必须带命名空间前缀（`prefix:meta` / `prefix:data:`）：
 *      `store.call` 拿到的是裸客户端，不会自动加前缀，而 `store.get/set` 会加。
 *      两边不一致的历史后果是「push 写进 A 键、shift 读 B 键」，Redis 后端下队列恒空。
 *   3. 读操作（length / list / peek / toArray）每次都回源，不允许把 meta 缓存在进程内。
 *   4. eval 必须是 redis v5 的 `(script, { keys, arguments })` 形式——
 *      v4/v5 的位置参数形式（`eval(script, 2, k1, k2, ...)`）会被当成 options 对象，
 *      运行时才炸，单元测试不碰 Redis 就发现不了。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';

/** 记录对 fake store 的所有调用 */
const rec = {
  evals: [],
  sets: [],
  gets: [],
  getResult: null,
  evalResult: null
};

const fakeStore = {
  get: async key => {
    rec.gets.push(key);
    return rec.getResult;
  },
  set: async (key, value) => {
    rec.sets.push({ key, value });
  },
  call: async fn => {
    const redis = {
      eval: async (script, options) => {
        rec.evals.push({ script, options });
        return rec.evalResult;
      }
    };
    return fn(redis);
  },
  destroy: async () => {}
};

jest.unstable_mockModule('../framework/redis/get-store.js', () => ({
  getStore: () => fakeStore
}));

// 只 mock「怎么拿到 store」；`utils.js` 保持真身 —— 只要有两个环境变量就能让
// `isRedisConfigured()` 为真，同时 `safeParse` 用的是生产实现（不复制一份进测试）。
const SAVED_ENV = { REDIS_ENABLED: process.env.REDIS_ENABLED, REDIS_HOST: process.env.REDIS_HOST };
process.env.REDIS_ENABLED = 'true';
process.env.REDIS_HOST = '127.0.0.1';

afterAll(() => {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const { createQueue } = await import('../framework/redis/queue-store.js');
const { createRingQueue } = await import('../framework/redis/ring-queue-store.js');

beforeEach(() => {
  rec.evals.length = 0;
  rec.sets.length = 0;
  rec.gets.length = 0;
  rec.getResult = null;
  rec.evalResult = null;
});

describe('Queue（Redis 后端）变更操作必须是一次 EVAL', () => {
  const PREFIX = 'wq';

  it('push 只发一次 EVAL，KEYS 带命名空间前缀，且不写 meta', async () => {
    rec.evalResult = 1;
    const q = createQueue(PREFIX, { backend: 'redis', maxSize: 500 });

    await q.push({ id: 1 });

    expect(rec.evals).toHaveLength(1);
    expect(rec.evals[0].options.keys).toEqual([`${PREFIX}:meta`, `${PREFIX}:data:`]);
    expect(rec.evals[0].options.arguments[0]).toBe('500');
    // 关键回归断言：指针只允许在脚本内改
    expect(rec.sets).toHaveLength(0);
  });

  it('push 达到上限时按脚本返回值抛 TypeError（不是靠本地读数判断）', async () => {
    rec.evalResult = -1;
    const q = createQueue(PREFIX, { backend: 'redis', maxSize: 2 });
    await expect(q.push('x')).rejects.toThrow(TypeError);
    expect(rec.sets).toHaveLength(0);
  });

  it('shift 只发一次 EVAL，且不把指针写回', async () => {
    rec.evalResult = JSON.stringify({ data: 'm1', createdAt: 1 });
    const q = createQueue(PREFIX, { backend: 'redis' });

    const msg = await q.shift();

    // 返回值是**已解析**的消息对象（与 Map 后端同形）；此前这里断言的是
    // `JSON.parse(msg).data`，等于把"Redis 后端返回原始字符串"这个缺陷写进了期望里。
    expect(msg.data).toBe('m1');
    expect(msg.createdAt).toBe(1);
    expect(rec.evals).toHaveLength(1);
    expect(rec.evals[0].options.keys).toEqual([`${PREFIX}:meta`, `${PREFIX}:data:`]);
    expect(rec.sets).toHaveLength(0);
  });

  it('shift 空队列返回 null（Lua 的 nil 映射）', async () => {
    rec.evalResult = null;
    const q = createQueue(PREFIX, { backend: 'redis' });
    await expect(q.shift()).resolves.toBeNull();
  });

  it('length 每次都回源 —— 别的实例写入后立刻可见（不存在进程内 meta 缓存）', async () => {
    const q = createQueue(PREFIX, { backend: 'redis' });

    rec.getResult = { head: 0, tail: 5 };
    expect(await q.length()).toBe(5);

    // 模拟另一个实例 push 了 4 条：若实现缓存了 meta，这里仍会返回 5
    rec.getResult = { head: 0, tail: 9 };
    expect(await q.length()).toBe(9);
    expect(rec.gets.filter(k => k === 'meta').length).toBeGreaterThanOrEqual(2);
  });

  it('maxSize 非正整数直接拒绝（Lua 里 % 0 会抛脚本错误）', () => {
    expect(() => createQueue(PREFIX, { backend: 'redis', maxSize: 0 })).toThrow(TypeError);
    expect(() => createQueue(PREFIX, { maxSize: -1 })).toThrow(TypeError);
  });
});

describe('RingQueue（Redis 后端）变更操作必须是一次 EVAL', () => {
  const PREFIX = 'wr';

  it('push 只发一次 EVAL，KEYS 带命名空间前缀，且不写 meta', async () => {
    rec.evalResult = 1;
    const ring = createRingQueue(PREFIX, { backend: 'redis', maxSize: 100 });

    expect(await ring.push('a')).toBe(1);

    expect(rec.evals).toHaveLength(1);
    expect(rec.evals[0].options.keys).toEqual([`${PREFIX}:meta`, `${PREFIX}:data:`]);
    expect(rec.evals[0].options.arguments[0]).toBe('100');
    expect(rec.sets).toHaveLength(0);
  });

  it('shift 只发一次 EVAL，空环返回 null', async () => {
    rec.evalResult = null;
    const ring = createRingQueue(PREFIX, { backend: 'redis', maxSize: 100 });
    await expect(ring.shift()).resolves.toBeNull();

    rec.evalResult = JSON.stringify({ data: 'a', createdAt: 1 });
    expect((await ring.shift()).data).toBe('a');
    expect(rec.sets).toHaveLength(0);
  });

  it('length 每次都回源 —— 并发写入者推进的 count 立刻可见', async () => {
    const ring = createRingQueue(PREFIX, { backend: 'redis', maxSize: 100 });

    rec.getResult = { head: 0, tail: 10, count: 10 };
    expect(await ring.length()).toBe(10);

    // 另一个实例又写了 5 条：缓存实现会继续报 10
    rec.getResult = { head: 0, tail: 15, count: 15 };
    expect(await ring.length()).toBe(15);
  });

  it('meta 缺失时按空环处理，不写初始化 meta', async () => {
    rec.getResult = null;
    const ring = createRingQueue(PREFIX, { backend: 'redis', maxSize: 100 });

    expect(await ring.length()).toBe(0);
    expect(await ring.toArray()).toEqual([]);
    expect(rec.sets).toHaveLength(0);
  });

  it('maxSize 非正整数直接拒绝', () => {
    expect(() => createRingQueue(PREFIX, { backend: 'redis', maxSize: 0 })).toThrow(TypeError);
    expect(() => createRingQueue(PREFIX, { maxSize: 1.5 })).toThrow(TypeError);
  });
});
