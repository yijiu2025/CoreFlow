/**
 * 环形队列 · Redis 后端语义测试
 *
 * 为什么必须单独有这一支：Map 版与 Redis 版是**两套独立实现**（后者把环形指针推进
 * 放进 Lua 里做原子操作），而 `ring-queue-store.test.js` 只驱动 Map 版。
 * 历史缺陷正是这样漏过的 —— `SHIFT_SCRIPT` 里写成了
 * `m.head = (m.head + maxSize) % maxSize`（该式恒等于 head），于是 `shift()` 第一次
 * 之后永远取到 nil，却仍把 count 减 1：队列静默丢消息，`length()` 与真实数据脱节，
 * 而所有 Map 版用例照常全绿。
 *
 * 因此本文件的判据是**两后端必须同形**：同样的操作序列，Redis 版必须给出与
 * Map 版完全一致的返回值序列与 length 变化。
 *
 * 无 Redis 环境时整支跳过（`lock-store.test.js` / `stream-store.test.js` 同款做法），
 * 且由 `redis-ci-guard.test.js` 反向保证 CI 里不会静默跳过。
 *
 * @author yijiu2025
 * @since 2026-10-31
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createRingQueue } from '../../../framework/redis/ring-queue-store.js';
import { isRedisConfigured } from '../../../framework/redis/utils.js';
import { connectTestRedis, disconnectTestRedis } from '../../helpers/redis-connection.js';

const describeOrSkip = isRedisConfigured() ? describe : describe.skip;

/** 每次用例用独立前缀，避免残留 meta 影响断言 */
let seq = 0;
const nextPrefix = () => `test_ring_redis_${Date.now()}_${++seq}`;

describeOrSkip('环形队列（Redis 后端）', () => {
  beforeAll(async () => {
    // isRedisConfigured() 只读环境变量，不代表真有连接；CI 里必须先显式建连
    await connectTestRedis();
  });

  afterAll(async () => {
    await disconnectTestRedis();
  });

  it('push 后 shift 必须按 FIFO 全部取出，且 length 同步递减', async () => {
    const ring = createRingQueue(nextPrefix(), { maxSize: 10, backend: 'redis' });
    try {
      await ring.push('a');
      await ring.push('b');
      await ring.push('c');
      expect(await ring.length()).toBe(3);

      // 这三条断言就是 SHIFT_SCRIPT 缺陷的回归点：
      // head 不前进时第 2 次 shift 会拿到 null（旧实现），length 却继续递减。
      expect((await ring.shift())?.data).toBe('a');
      expect(await ring.length()).toBe(2);
      expect((await ring.shift())?.data).toBe('b');
      expect(await ring.length()).toBe(1);
      expect((await ring.shift())?.data).toBe('c');
      expect(await ring.length()).toBe(0);
    } finally {
      await ring.clear();
    }
  });

  it('shift 到空后返回 null，且不会把 count 减成负数', async () => {
    const ring = createRingQueue(nextPrefix(), { maxSize: 5, backend: 'redis' });
    try {
      await ring.push('only');
      expect((await ring.shift())?.data).toBe('only');

      expect(await ring.shift()).toBeNull();
      expect(await ring.shift()).toBeNull();
      expect(await ring.length()).toBe(0);
    } finally {
      await ring.clear();
    }
  });

  it('取出的元素与 toArray 的可见集合始终一致（不允许指针错位）', async () => {
    const ring = createRingQueue(nextPrefix(), { maxSize: 10, backend: 'redis' });
    try {
      for (const v of ['a', 'b', 'c', 'd']) await ring.push(v);

      expect((await ring.shift())?.data).toBe('a');
      expect((await ring.toArray()).map(i => i.data)).toEqual(['b', 'c', 'd']);
      expect(await ring.length()).toBe(3);

      expect((await ring.shift())?.data).toBe('b');
      expect((await ring.toArray()).map(i => i.data)).toEqual(['c', 'd']);
      expect(await ring.length()).toBe(2);
    } finally {
      await ring.clear();
    }
  });

  it('满队列覆盖最旧后，shift 仍从当前最旧开始（覆盖推进 head 与 shift 推进 head 不打架）', async () => {
    const ring = createRingQueue(nextPrefix(), { maxSize: 3, backend: 'redis' });
    try {
      for (const v of ['a', 'b', 'c', 'd', 'e']) await ring.push(v); // a、b 被覆盖
      expect(await ring.length()).toBe(3);
      expect((await ring.toArray()).map(i => i.data)).toEqual(['c', 'd', 'e']);

      expect((await ring.shift())?.data).toBe('c');
      expect((await ring.shift())?.data).toBe('d');
      expect((await ring.shift())?.data).toBe('e');
      expect(await ring.length()).toBe(0);
    } finally {
      await ring.clear();
    }
  });

  it('shift + push 混用保持 FIFO（head/tail 独立推进）', async () => {
    const ring = createRingQueue(nextPrefix(), { maxSize: 3, backend: 'redis' });
    try {
      await ring.push('a');
      await ring.push('b');
      await ring.push('c');
      expect((await ring.shift())?.data).toBe('a');
      await ring.push('d'); // 队尾落在被释放的槽位上

      expect((await ring.toArray()).map(i => i.data)).toEqual(['b', 'c', 'd']);
      expect((await ring.shift())?.data).toBe('b');
      expect((await ring.shift())?.data).toBe('c');
      expect((await ring.shift())?.data).toBe('d');
      expect(await ring.length()).toBe(0);
    } finally {
      await ring.clear();
    }
  });

  it('与 Map 后端同形：同一操作序列的返回序列完全一致', async () => {
    const ops = [['push', 'a'], ['push', 'b'], ['shift'], ['push', 'c'], ['shift'], ['shift'], ['shift']];

    const runWith = async ring => {
      const out = [];
      for (const [op, arg] of ops) {
        const r = op === 'push' ? await ring.push(arg) : await ring.shift();
        out.push(op === 'push' ? `count:${r}` : (r?.data ?? null));
      }
      out.push(`len:${await ring.length()}`);
      return out;
    };

    const mapRing = createRingQueue(`${nextPrefix()}_map`, { maxSize: 5 });
    const redisRing = createRingQueue(nextPrefix(), { maxSize: 5, backend: 'redis' });
    try {
      expect(await runWith(redisRing)).toEqual(await runWith(mapRing));
    } finally {
      await redisRing.clear();
    }
  });
});
