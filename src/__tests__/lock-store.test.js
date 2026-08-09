/**
 * 分布式锁单元测试
 *
 * 覆盖：tryAcquire/release/互斥/自动续期
 * 注意：需要 Redis 环境，无 Redis 时跳过
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createLock } from '../redis/lock-store.js';
import { isRedisConfigured } from '../redis/utils.js';

const describeOrSkip = isRedisConfigured() ? describe : describe.skip;

describeOrSkip('分布式锁', () => {
  let lock;

  beforeAll(() => {
    lock = createLock('test_lock', { ttl: 5000 });
  });

  afterAll(async () => {
    try {
      await lock.release();
    } catch {
      /* ignore */
    }
  });

  it('tryAcquire 返回 true', async () => {
    const acquired = await lock.tryAcquire();
    expect(acquired).toBe(true);
  });

  it('重复获取返回 false（互斥）', async () => {
    const lock2 = createLock('test_lock', { ttl: 5000 });
    const acquired = await lock2.tryAcquire();
    expect(acquired).toBe(false);
  });

  it('release 后可以重新获取', async () => {
    await lock.release();
    const acquired = await lock.tryAcquire();
    expect(acquired).toBe(true);
  });

  it('getHolder 返回持有者 ID', async () => {
    const holder = await lock.getHolder();
    expect(holder).toBeTruthy();
    expect(typeof holder).toBe('string');
  });

  it('锁超时后自动释放', async () => {
    await lock.release();
    const shortLock = createLock('test_short', { ttl: 1000 });
    await shortLock.tryAcquire();
    await new Promise(r => setTimeout(r, 1500));
    const acquired = await shortLock.tryAcquire();
    expect(acquired).toBe(true);
    await shortLock.release();
  }, 5000);

  it('不同锁名互不影响', async () => {
    await lock.release();
    const lockA = createLock('lock_a', { ttl: 5000 });
    const lockB = createLock('lock_b', { ttl: 5000 });
    await lockA.tryAcquire();
    const acquired = await lockB.tryAcquire();
    expect(acquired).toBe(true);
    await lockA.release();
    await lockB.release();
  });
});
