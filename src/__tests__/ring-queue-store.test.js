/**
 * 循环队列单元测试
 *
 * 覆盖：push/自动覆盖/shift/toArray/满队列覆盖/clear
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MapStore } from '../redis/map-store.js';
import { createRingQueue } from '../redis/ring-queue-store.js';

describe('createRingQueue', () => {
  const PREFIX = 'test_ring';

  beforeEach(() => {
    MapStore.destroy(PREFIX);
  });

  afterEach(() => {
    MapStore.destroy(PREFIX);
  });

  it('push 和 toArray 基本 FIFO 顺序', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 10 });
    ring.push('a');
    ring.push('b');
    ring.push('c');

    const items = ring.toArray();
    expect(items.map(i => i.data)).toEqual(['a', 'b', 'c']);
    expect(ring.length()).toBe(3);
  });

  it('满 maxSize 后自动覆盖最旧', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 3 });
    ring.push('a');
    ring.push('b');
    ring.push('c');
    ring.push('d'); // 覆盖 a
    ring.push('e'); // 覆盖 b

    const items = ring.toArray();
    expect(items.map(i => i.data)).toEqual(['c', 'd', 'e']);
    expect(ring.length()).toBe(3);
  });

  it('满队列后继续写入保持 count = maxSize', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 5 });
    for (let i = 0; i < 20; i++) {
      ring.push(`msg-${i}`);
    }
    expect(ring.length()).toBe(5);
    const items = ring.toArray();
    expect(items.map(i => i.data)).toEqual(['msg-15', 'msg-16', 'msg-17', 'msg-18', 'msg-19']);
  });

  it('shift 取出最旧条目', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 5 });
    ring.push('a');
    ring.push('b');
    ring.push('c');

    expect(ring.shift().data).toBe('a');
    expect(ring.shift().data).toBe('b');
    expect(ring.length()).toBe(1);
    expect(ring.toArray().map(i => i.data)).toEqual(['c']);
  });

  it('shift 空队列返回 null', () => {
    const ring = createRingQueue(PREFIX);
    expect(ring.shift()).toBeNull();
  });

  it('shift + push 混用保持正确顺序', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 3 });
    ring.push('a');
    ring.push('b');
    ring.push('c');
    ring.shift(); // 移除 a
    ring.push('d'); // 队列：[b, c, d]

    const items = ring.toArray();
    expect(items.map(i => i.data)).toEqual(['b', 'c', 'd']);
  });

  it('toArray(limit) 限制返回条数', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 10 });
    for (let i = 0; i < 5; i++) ring.push(`msg-${i}`);
    expect(ring.toArray(3)).toHaveLength(3);
    expect(ring.toArray(0)).toHaveLength(5);
  });

  it('clear 清空队列', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 5 });
    ring.push('a');
    ring.push('b');
    ring.clear();
    expect(ring.length()).toBe(0);
    expect(ring.toArray()).toEqual([]);
  });

  it('clear 后可以继续写入', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 5 });
    ring.push('a');
    ring.clear();
    ring.push('b');
    expect(ring.toArray().map(i => i.data)).toEqual(['b']);
  });

  it('usage 返回容量信息', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 10 });
    ring.push('a');
    ring.push('b');
    const u = ring.usage();
    expect(u.capacity).toBe(10);
    expect(u.used).toBe(2);
    expect(u.free).toBe(8);
  });

  it('maxSize=1 时始终只有最新一条', () => {
    const ring = createRingQueue(PREFIX, { maxSize: 1 });
    ring.push('a');
    expect(ring.toArray().map(i => i.data)).toEqual(['a']);
    ring.push('b');
    expect(ring.toArray().map(i => i.data)).toEqual(['b']);
    ring.push('c');
    expect(ring.length()).toBe(1);
    expect(ring.toArray().map(i => i.data)).toEqual(['c']);
  });

  it('不同的 prefix 互不影响', () => {
    const r1 = createRingQueue('ring_a', { maxSize: 3 });
    const r2 = createRingQueue('ring_b', { maxSize: 3 });
    r1.push('from_a');
    r2.push('from_b');
    r1.push('a2');
    expect(r1.toArray().map(i => i.data)).toEqual(['from_a', 'a2']);
    expect(r2.toArray().map(i => i.data)).toEqual(['from_b']);
  });
});
