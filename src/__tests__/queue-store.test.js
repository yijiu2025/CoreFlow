/**
 * 队列存储单元测试
 *
 * 覆盖：push/shift/peek/clear/满队列重置/空洞跳过
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MapStore } from '../redis/map-store.js';
import { createQueue } from '../redis/queue-store.js';

describe('createQueue', () => {
  const PREFIX = 'test_queue';

  beforeEach(() => {
    MapStore.destroy(PREFIX);
  });

  afterEach(() => {
    MapStore.destroy(PREFIX);
  });

  it('push 和 shift 基本 FIFO 顺序', () => {
    const q = createQueue(PREFIX);
    q.push('a');
    q.push('b');
    q.push('c');

    expect(q.shift().data).toBe('a');
    expect(q.shift().data).toBe('b');
    expect(q.shift().data).toBe('c');
    expect(q.shift()).toBeNull();
  });

  it('shift 返回完整消息对象（含 createdAt）', () => {
    const q = createQueue(PREFIX);
    q.push({ id: 1 });
    const msg = q.shift();
    expect(msg).toHaveProperty('data');
    expect(msg).toHaveProperty('createdAt');
    expect(msg.data).toEqual({ id: 1 });
    expect(typeof msg.createdAt).toBe('number');
  });

  it('peek 查看队头但不取出', () => {
    const q = createQueue(PREFIX);
    q.push('first');
    q.push('second');

    const peeked = q.peek();
    expect(peeked.data).toBe('first');

    // peek 后队列不变
    expect(q.length()).toBe(2);
    expect(q.shift().data).toBe('first');
  });

  it('length 返回正确长度', () => {
    const q = createQueue(PREFIX);
    expect(q.length()).toBe(0);
    q.push('a');
    expect(q.length()).toBe(1);
    q.push('b');
    expect(q.length()).toBe(2);
    q.shift();
    expect(q.length()).toBe(1);
    q.shift();
    expect(q.length()).toBe(0);
  });

  it('clear 清空队列', () => {
    const q = createQueue(PREFIX);
    q.push('a');
    q.push('b');
    q.clear();
    expect(q.length()).toBe(0);
    expect(q.shift()).toBeNull();
  });

  it('clear 后可以继续写入', () => {
    const q = createQueue(PREFIX);
    q.push('a');
    q.clear();
    q.push('b');
    expect(q.shift().data).toBe('b');
  });

  it('usage 返回容量信息', () => {
    const q = createQueue(PREFIX, { maxSize: 100 });
    q.push('a');
    q.push('b');
    const u = q.usage();
    expect(u).toHaveProperty('capacity', 100);
    expect(u).toHaveProperty('used', 2);
    expect(u).toHaveProperty('free', 98);
    expect(u.percent).toBeGreaterThan(0);
  });

  it('满队列时拒绝写入', () => {
    const q = createQueue(PREFIX, { maxSize: 3 });
    q.push('a');
    q.push('b');
    q.push('c');
    expect(() => q.push('d')).toThrow(TypeError);
  });

  it('满队列且数据被外部删除后重置指针', () => {
    const q = createQueue(PREFIX, { maxSize: 3 });
    q.push('a');
    q.push('b');
    q.push('c');
    // 外部删除所有数据条目（模拟 TTL 过期或手动清理）
    MapStore.delete(PREFIX, 'data:0');
    MapStore.delete(PREFIX, 'data:1');
    MapStore.delete(PREFIX, 'data:2');
    // 此时队列逻辑上满了（len=3），但实际数据已空
    q.push('d'); // 应触发重置，head=0, tail=1
    expect(q.length()).toBe(1);
    expect(q.shift().data).toBe('d');
  });

  it('tryPush 在满队列时不抛错', () => {
    const q = createQueue(PREFIX, { maxSize: 2 });
    q.push('a');
    q.push('b');
    const result = q.tryPush('c');
    expect(result).toBe(false);
    expect(q.length()).toBe(2);
  });

  it('list 返回所有消息', () => {
    const q = createQueue(PREFIX);
    q.push('x');
    q.push('y');
    const items = q.list();
    expect(items).toHaveLength(2);
    expect(items[0].data).toBe('x');
    expect(items[1].data).toBe('y');
  });

  it('list(limit) 限制返回条数', () => {
    const q = createQueue(PREFIX);
    q.push('a');
    q.push('b');
    q.push('c');
    expect(q.list(2)).toHaveLength(2);
    expect(q.list(1)).toHaveLength(1);
    expect(q.list(0)).toHaveLength(3);
  });

  it('shift 空队列返回 null', () => {
    const q = createQueue(PREFIX);
    expect(q.shift()).toBeNull();
  });

  it('peek 空队列返回 null', () => {
    const q = createQueue(PREFIX);
    expect(q.peek()).toBeNull();
  });

  it('dataTtl 过期后 shift 自动跳过', async () => {
    const q = createQueue(PREFIX, { dataTtl: 1, maxSize: 10 });
    q.push('expire');
    await new Promise(r => setTimeout(r, 1100));
    // 数据已过期，shift 应跳过空洞，重置指针
    const result = q.shift();
    expect(result).toBeNull();
    expect(q.length()).toBe(0);
  }, 5000);

  it('不同的 prefix 互不影响', () => {
    const q1 = createQueue('queue_a');
    const q2 = createQueue('queue_b');
    q1.push('from_a');
    q2.push('from_b');
    expect(q1.shift().data).toBe('from_a');
    expect(q2.shift().data).toBe('from_b');
  });
});
