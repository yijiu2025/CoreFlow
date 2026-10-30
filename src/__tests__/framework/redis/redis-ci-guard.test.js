/**
 * CI 守卫：Redis 集成套件必须真的跑起来
 *
 * lock-store / stream-store 两个套件在 `isRedisConfigured()` 为 false 时是
 * `describe.skip`。这在本地是正确的降级，但在 CI 里会变成**静默的零覆盖**：
 * 报告上只是多出「2 套件跳过」，没人会注意到分布式锁/消费者组从来没被验证过。
 *
 * 所以 CI 的 test 作业显式声明 `EXPECT_REDIS=true`，本文件负责把"配置没生效"
 * 变成一条红色失败，而不是一条被忽略的跳过。
 *
 * 本地默认不设该变量，文件整体跳过。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, afterAll } from '@jest/globals';

const EXPECT_REDIS = process.env.EXPECT_REDIS === 'true';
const describeIfExpected = EXPECT_REDIS ? describe : describe.skip;

const { isRedisConfigured } = await import('../../../framework/redis/utils.js');
const { connectStandalone, disconnectStandalone, createLock } = await import('../../../framework/redis/index.js');

describeIfExpected('CI：Redis 集成套件必须真实运行', () => {
  afterAll(async () => {
    try {
      await disconnectStandalone();
    } catch {
      /* 可能本来就没连上 */
    }
  });

  it('REDIS_ENABLED 已生效（否则两个 describe.skip 套件被静默跳过）', () => {
    expect(isRedisConfigured()).toBe(true);
  });

  it('能真的连上并读写（不是配了地址但没有服务）', async () => {
    const conn = await connectStandalone({ timeoutMs: 8000 });
    expect(conn.ready).toBe(true);

    const lock = createLock(`ci-guard-${Date.now()}`, { ttl: 5000 });
    expect(await lock.tryAcquire()).toBe(true);
    expect(await lock.getHolder()).toBeTruthy();
    await lock.release();
  }, 20000);

  it('REDIS_DB 指向隔离库（不落到 db0 的真实数据）', () => {
    expect(process.env.REDIS_DB).toBe('15');
  });
});
