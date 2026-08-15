/**
 * 缓存辅助工具
 *
 * 提供 Cache-Aside + singleflight 模式，防止缓存击穿。
 * 热点 key 过期时，只有一个请求查 DB 重建缓存，其他请求等待后读缓存。
 *
 * @example
 * const user = await cacheThrough('user:1001', () => db.findUser(1001), 600);
 *
 * @author yijiu2025
 * @since 2026-08-06
 */

import { getStore } from './get-store.js';
import { createLock } from './lock-store.js';

/**
 * Cache-Aside + singleflight 防击穿
 * 缓存命中 → 返回；未命中 → 加锁 → 查 DB → 写缓存 → 返回
 *
 * @param {string} key - 缓存 key
 * @param {Function} fetchFn - 数据获取函数，返回 Promise
 * @param {number} ttl - 缓存 TTL（秒）
 * @param {object} [options]
 * @param {string} [options.prefix='cache'] - 缓存前缀
 * @param {number} [options.retryDelay=50] - 等待重建时的重试间隔（ms）
 * @param {number} [options.lockTtl=5000] - 锁超时（ms），默认 5s
 * @returns {Promise<any>} 缓存数据或 fetchFn 返回值
 */
export async function cacheThrough(key, fetchFn, ttl, options = {}) {
  const { prefix = 'cache', retryDelay = 50, lockTtl = 5000 } = options;
  const store = getStore(prefix);

  // 1. 查缓存
  const cached = await store.get(key);
  if (cached !== null) return cached;

  // 2. 未命中：singleflight 防击穿
  const lock = createLock(`cache:${prefix}:${key}`, { ttl: Math.min(lockTtl, ttl * 1000) });
  const acquired = await lock.tryAcquire();

  if (!acquired) {
    // 其他请求正在重建，指数退避等待，最多重试 3 次
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, i)));
      const value = await store.get(key);
      if (value !== null) return value;
    }
    return null;
  }

  try {
    // 3. 查 DB（可能拿到锁时缓存已被其他实例重建）
    const cachedAgain = await store.get(key);
    if (cachedAgain !== null) return cachedAgain;

    const value = await fetchFn();
    if (value !== null && value !== undefined) {
      await store.set(key, value, ttl);
    }
    return value;
  } finally {
    await lock.release();
  }
}

/**
 * 更新 DB 时主动失效缓存（延迟双删）
 * 先更新 DB，再删除缓存，500ms 后再删一次，防止并发读写导致脏数据
 *
 * @param {string} key - 缓存 key
 * @param {Function} updateFn - DB 更新函数
 * @param {string} [prefix='cache'] - 缓存前缀
 * @returns {Promise<any>} updateFn 的返回值
 */
export async function cacheInvalidate(key, updateFn, prefix = 'cache') {
  const store = getStore(prefix);
  const result = await updateFn();
  // 先删缓存
  await store.delete(key);
  // 延迟再删一次（防并发读写）
  setTimeout(async () => {
    try {
      await store.delete(key);
    } catch {
      /* 安全忽略 */
    }
  }, 500);
  return result;
}
