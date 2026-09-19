/**
 * 调度器多实例语义单元测试
 *
 * 覆盖"定时任务会不会被重复执行"这一全部决策逻辑：
 * - 未配置 Redis（单实例）→ 保持原有行为，每次都执行
 * - 配置了 Redis → 抢占周期锁，一个周期内全集群只有一个实例执行
 * - **Redis 不可达 → 跳过本轮，绝不回退到本地执行**（回退会造成多实例重复执行）
 * - 锁 TTL 必须等于任务周期（否则锁提前过期，下个实例会重复跑）
 *
 * 测试用一把"模拟 SET NX 语义"的假锁替代真实 Redis，
 * 因此不需要 Redis 环境也能验证"两实例只执行一次"——这类断言若依赖真实 Redis
 * 就会变成 describe.skip，等于没有覆盖。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ── 被测模块的可控替身 ──
// 用模块级变量暴露开关，使替身在不同用例间可切换而无需重新 import
let redisConfigured = false;
let lockShouldThrow = false;
/** 假锁的持有者集合 —— 用来复刻 Redis SET NX 的互斥语义 */
const heldLocks = new Set();
/** 记录 createLock 的入参，用于断言 TTL */
const createLockCalls = [];

jest.unstable_mockModule('../../../framework/redis/utils.js', () => ({
  isRedisConfigured: () => redisConfigured
}));

jest.unstable_mockModule('../../../framework/redis/lock-store.js', () => ({
  createLock: (name, options) => {
    if (lockShouldThrow) throw new Error('模拟 Redis 不可达');
    createLockCalls.push({ name, options });
    return {
      // 复刻 SET key val NX PX ttl：同名锁只有一个赢家
      async tryAcquire() {
        if (heldLocks.has(name)) return false;
        heldLocks.add(name);
        return true;
      }
    };
  }
}));

const { acquirePeriodLock, executeTask } = await import('../../../framework/scheduler/index.js');

/** 构造一个可断言"是否被执行"的任务工厂 */
function makeTaskFactory() {
  const calls = [];
  return {
    calls,
    factory: {
      name: 'test-task',
      run: async () => {
        calls.push(Date.now());
      }
    }
  };
}

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  redisConfigured = false;
  lockShouldThrow = false;
  heldLocks.clear();
  createLockCalls.length = 0;
});

describe('调度器 · 未配置 Redis（单实例部署）', () => {
  it('不加锁，直接允许执行（保持原有行为）', async () => {
    expect(await acquirePeriodLock('session-cleanup', 24 * HOUR)).toBe(true);
    // 未走锁路径，因此不应产生任何 createLock 调用
    expect(createLockCalls).toHaveLength(0);
  });
});

describe('调度器 · 配置了 Redis（多实例部署）', () => {
  beforeEach(() => {
    redisConfigured = true;
  });

  it('锁 TTL 必须等于任务周期，否则锁会提前过期导致重复执行', async () => {
    const interval = 24 * HOUR;
    await acquirePeriodLock('session-cleanup', interval);
    expect(createLockCalls).toHaveLength(1);
    expect(createLockCalls[0].name).toBe('scheduler:session-cleanup');
    expect(createLockCalls[0].options.ttl).toBe(interval);
  });

  it('第一个实例抢到锁，第二个实例抢不到', async () => {
    expect(await acquirePeriodLock('session-cleanup', 24 * HOUR)).toBe(true);
    expect(await acquirePeriodLock('session-cleanup', 24 * HOUR)).toBe(false);
  });

  it('Redis 不可达时跳过本轮，**不回退到本地执行**', async () => {
    lockShouldThrow = true;
    expect(await acquirePeriodLock('session-cleanup', 24 * HOUR)).toBe(false);
  });
});

describe('调度器 · 两实例并发只执行一次（核心不变量）', () => {
  it('同一周期内两个实例同时触发，任务体只被执行一次', async () => {
    redisConfigured = true;
    const { calls, factory } = makeTaskFactory();
    const params = { taskKey: 'session-cleanup', taskFactory: factory, taskConfig: {}, intervalMs: 24 * HOUR };

    // 两个实例的定时器在同一时刻触发
    await Promise.all([executeTask(params), executeTask(params)]);

    expect(calls).toHaveLength(1);
  });

  it('拿到锁的实例确实执行了任务（防止"锁住了但谁都没跑"）', async () => {
    redisConfigured = true;
    const { calls, factory } = makeTaskFactory();

    await executeTask({
      taskKey: 'session-cleanup',
      taskFactory: factory,
      taskConfig: {},
      intervalMs: 24 * HOUR
    });

    expect(calls).toHaveLength(1);
  });

  it('未拿到锁的实例完全不触碰任务体', async () => {
    redisConfigured = true;
    // createLock 内部会补 `lock:` 前缀，这里必须与之一致
    heldLocks.add('scheduler:session-cleanup'); // 事先被别的实例占住
    const { calls, factory } = makeTaskFactory();

    await executeTask({
      taskKey: 'session-cleanup',
      taskFactory: factory,
      taskConfig: {},
      intervalMs: 24 * HOUR
    });

    expect(calls).toHaveLength(0);
  });

  it('不同任务各自独立持锁，互不阻塞', async () => {
    redisConfigured = true;
    expect(await acquirePeriodLock('session-cleanup', 24 * HOUR)).toBe(true);
    expect(await acquirePeriodLock('another-task', 24 * HOUR)).toBe(true);
  });
});
