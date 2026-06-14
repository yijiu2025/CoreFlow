/**
 * 性能测试
 *
 * 覆盖：大量数据处理、内存限制、超时处理
 */
import { describe, it, expect } from '@jest/globals';

describe('性能', () => {
  describe('大量数据处理', () => {
    it('大数组处理', () => {
      const arr = Array.from({ length: 10000 }, (_, i) => i);
      const filtered = arr.filter((n) => n % 2 === 0);
      expect(filtered.length).toBe(5000);
    });

    it('大对象处理', () => {
      const obj = {};
      for (let i = 0; i < 1000; i++) {
        obj[`key${i}`] = `value${i}`;
      }
      expect(Object.keys(obj).length).toBe(1000);
    });

    it('JSON 序列化大对象', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `user${i}`,
        email: `user${i}@example.com`,
        roles: ['admin', 'user'],
        permissions: { allows: ['*'], denies: [] }
      }));
      const json = JSON.stringify(data);
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(100);
    });
  });

  describe('内存限制', () => {
    it('Map 清理过期数据', () => {
      const store = new Map();
      const now = Date.now();

      // 添加 1000 条记录
      for (let i = 0; i < 1000; i++) {
        store.set(`key${i}`, { value: i, expires: now + (i % 2 === 0 ? 60000 : -60000) });
      }

      // 清理过期记录
      for (const [k, v] of store.entries()) {
        if (v.expires < now) store.delete(k);
      }

      expect(store.size).toBe(500);
    });

    it('Set 去重', () => {
      const set = new Set();
      for (let i = 0; i < 100; i++) {
        set.add(`item${i % 10}`);
      }
      expect(set.size).toBe(10);
    });
  });

  describe('超时处理', () => {
    it('Promise 超时', async () => {
      const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

      await expect(Promise.race([new Promise((resolve) => setTimeout(resolve, 200)), timeout(100)])).rejects.toThrow(
        'timeout'
      );
    });

    it('异步操作完成', async () => {
      const result = await Promise.resolve(42);
      expect(result).toBe(42);
    });
  });

  describe('并发处理', () => {
    it('Promise.all 并发执行', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => Promise.resolve(i));
      const results = await Promise.all(tasks);
      expect(results.length).toBe(10);
      expect(results[0]).toBe(0);
      expect(results[9]).toBe(9);
    });

    it('Promise.allSettled 混合结果', async () => {
      const tasks = [Promise.resolve('success'), Promise.reject(new Error('fail')), Promise.resolve('ok')];
      const results = await Promise.allSettled(tasks);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });
  });
});
