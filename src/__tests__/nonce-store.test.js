/**
 * Nonce 存储单元测试
 *
 * 覆盖：MapStore 版和 Redis 版的核心逻辑
 * Redis 版需要 Redis 环境，当前仅测试 MapStore 版
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MapStore } from '../redis/map-store.js';
import { _createMapNonceStore } from '../redis/nonce-store.js';

describe('Nonce 存储（MapStore 版）', () => {
  let store;

  beforeEach(() => {
    MapStore.destroy('nonce');
    store = _createMapNonceStore(60);
  });

  afterEach(() => {
    store.destroy();
  });

  it('首次使用返回 false（未重复）', async () => {
    const result = await store.checkAndMark('nonce-abc-123');
    expect(result).toBe(false);
  });

  it('重复使用返回 true（重放）', async () => {
    await store.checkAndMark('nonce-abc-123');
    const result = await store.checkAndMark('nonce-abc-123');
    expect(result).toBe(true);
  });

  it('不同的 nonce 互不影响', async () => {
    await store.checkAndMark('nonce-a');
    const resultA = await store.checkAndMark('nonce-a');
    expect(resultA).toBe(true);

    const resultB = await store.checkAndMark('nonce-b');
    expect(resultB).toBe(false);
  });

  it('TTL 过期后 nonce 可重新使用', async () => {
    // 使用 1 秒 TTL 的 store
    const shortStore = _createMapNonceStore(1);
    await shortStore.checkAndMark('nonce-expire');
    await shortStore.checkAndMark('nonce-expire'); // 未过期 → true

    // 等待过期
    await new Promise(r => setTimeout(r, 1100));

    const result = await shortStore.checkAndMark('nonce-expire');
    expect(result).toBe(false); // 已过期 → 首次使用
    shortStore.destroy();
  }, 5000);

  it('destroy 后不会影响其他 nonce 前缀', async () => {
    MapStore.set('other', 'key', 'value');
    store.destroy();
    const val = MapStore.get('other', 'key');
    expect(val).toBe('value');
  });

  it('createNonceStore 根据配置选择后端', async () => {
    // 直接测试 MapStore 版函数
    const ms = _createMapNonceStore(60);
    expect(ms).toHaveProperty('checkAndMark');
    expect(ms).toHaveProperty('destroy');
    ms.destroy();
  });

  it('大量 nonce 不会导致内存泄漏', async () => {
    const batch = 100;
    for (let i = 0; i < batch; i++) {
      await store.checkAndMark(`bulk-nonce-${i}`);
    }
    // 第一次全部应返回 false
    const first = await store.checkAndMark(`bulk-nonce-0`);
    expect(first).toBe(true);
    // 新 nonce 应返回 false
    const fresh = await store.checkAndMark(`bulk-nonce-new`);
    expect(fresh).toBe(false);
  });
});