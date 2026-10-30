/**
 * 资源上限与背压（真实模块驱动）
 *
 * 旧版本文件是「JS 语言特性自测」：数组 filter 长度、Map 删除、Promise.race 超时……
 * 全部不 import 生产代码，删除被测模块后仍全绿（毒丸实验已证实）。
 *
 * 本版只测**生产代码里的真实资源闸门**，断言的都是"超出上限时系统怎么反应"：
 * - scrypt 并发上限：超限抛 SCRYPT_BUSY 让上层 503 背压，而不是无界排队拖垮进程
 * - MapStore 硬上限：满时拒绝写入并保留已有数据（不是静默淘汰）
 *
 * 这些断言在"把闸门去掉"时必然变红 ——— 那正是它们存在的意义。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// 必须在 import password-hash 之前设定：并发上限是模块加载时从 env 读的常量
process.env.SCRYPT_MAX_CONCURRENCY = '1';

const { MapStore } = await import('../framework/redis/map-store.js');
const { hashPassword, verifyPassword } = await import('../framework/auth/password-hash.js');

describe('scrypt 并发上限（背压而非排队）', () => {
  it('超过并发上限时立刻抛 SCRYPT_BUSY，不进入队列', async () => {
    // 第一个调用在 await 前就同步占用了名额，第二个必然看到 active >= 上限
    const first = hashPassword('first-password');
    const second = hashPassword('second-password');

    await expect(second).rejects.toMatchObject({ code: 'SCRYPT_BUSY' });
    await expect(first).resolves.toMatch(/^scrypt\$/);
  });

  it('被拒绝的请求不占名额：之前之后都能正常哈希', async () => {
    await expect(hashPassword('before')).resolves.toMatch(/^scrypt\$/);

    const holder = hashPassword('holder');
    await expect(hashPassword('rejected')).rejects.toMatchObject({ code: 'SCRYPT_BUSY' });
    await holder;

    // 若拒绝路径漏了 _scryptActive--，这里会一直 SCRYPT_BUSY
    await expect(hashPassword('after')).resolves.toMatch(/^scrypt\$/);
  });

  it('饱和时校验返回 false 而不是抛错（fail-closed）', async () => {
    const stored = await hashPassword('correct-password');

    const holder = hashPassword('holder-2');
    // 校验路径把 SCRYPT_BUSY 吞成"不匹配"：宁可误拒一次登录，也不让异常冒到路由层
    await expect(verifyPassword('correct-password', stored)).resolves.toBe(false);
    await holder;

    await expect(verifyPassword('correct-password', stored)).resolves.toBe(true);
  });
});

describe('MapStore 硬上限（拒绝写入而非静默淘汰）', () => {
  const PREFIX = '__perf_test_cap__';

  beforeAll(() => {
    MapStore.config(PREFIX, { maxSize: 3, ttl: 0 });
  });

  afterAll(() => {
    MapStore.destroy(PREFIX);
  });

  it('装满后继续写入抛 TypeError', () => {
    MapStore.set(PREFIX, 'k1', 1);
    MapStore.set(PREFIX, 'k2', 2);
    MapStore.set(PREFIX, 'k3', 3);

    expect(() => MapStore.set(PREFIX, 'k4', 4)).toThrow(TypeError);
    expect(() => MapStore.set(PREFIX, 'k4', 4)).toThrow(/已达上限 3/);
  });

  it('拒绝写入不会破坏已有数据', () => {
    expect(MapStore.get(PREFIX, 'k1')).toBe(1);
    expect(MapStore.get(PREFIX, 'k3')).toBe(3);
    expect(MapStore.get(PREFIX, 'k4')).toBeNull();
  });

  it('删除一条后重新可写（上限是容量约束，不是永久锁死）', () => {
    MapStore.delete(PREFIX, 'k2');
    expect(() => MapStore.set(PREFIX, 'k4', 4)).not.toThrow();
    expect(MapStore.get(PREFIX, 'k4')).toBe(4);
  });
});
