/**
 * ResilientStore 的实例计数与健康订阅
 *
 * 背景（2026-11-07）：启动日志里每条路由都刷一条
 * `[Redis] ResilientStore 实例数已达 80，请检查是否动态创建了过多路由`。
 * 实测后确认**不是泄漏**：`@fastify/rate-limit` 对每条带 `config.rateLimit` 的路由
 * 调一次 `store.child()`（Fastify 给每个 GET 自动生成的 HEAD 也算一条），
 * 同 groupId 的端点共享桶但仍是独立实例 —— 本仓库 52 个逻辑桶 → 83 个 child + 1 个父。
 * 也就是说这个数字由路由表决定，是常量。
 *
 * 由此改了两处，本文件把两处都钉住：
 *   ① 汇总日志改成启动结束打**一条**（原先按「>50 且 10 的倍数」打，一次启动刷 3 条），
 *      只有真的异常增长（> 500）才 warn —— 那才是"运行期反复注册路由"的特征。
 *   ② 健康订阅只由**父实例**注册。原先每个 child 都订阅，一次 Redis 主备切换
 *      会打出 N 行完全相同的日志，把真正的故障信息淹掉。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

import { describe, it, expect, jest } from '@jest/globals';

/** 捕获模块级日志（汇总与告警都走它，不是 app.log） */
const infos = [];
const warnings = [];
const stubLogger = {
  info: (...a) => infos.push(a.join(' ')),
  warn: (...a) => warnings.push(a.join(' ')),
  error: () => {},
  debug: () => {}
};

jest.unstable_mockModule('../../../../framework/support/log/index.js', () => ({
  createLogger: () => stubLogger,
  initLogErrorTraps: () => {},
  default: stubLogger
}));

const { createBoundStore } = await import('../../../../framework/persistence/redis/resilient-store.js');

/** 假 app：记录 onReady 钩子与健康订阅次数 */
function makeApp() {
  const hooks = new Map();
  let subscriptions = 0;
  return {
    log: { info() {}, warn() {}, error() {}, debug() {} },
    addHook(name, fn) {
      if (!hooks.has(name)) hooks.set(name, []);
      hooks.get(name).push(fn);
    },
    onRedisHealthChange() {
      subscriptions++;
      return () => {
        subscriptions--;
      };
    },
    get subscriptionCount() {
      return subscriptions;
    },
    async fireReady() {
      for (const fn of hooks.get('onReady') || []) await fn();
    }
  };
}

describe('ResilientStore · 实例与订阅', () => {
  it('父实例 + 任意多个 child 只注册一次健康订阅', () => {
    const app = makeApp();
    const Store = createBoundStore(app);
    const parent = new Store({});

    expect(app.subscriptionCount).toBe(1);

    // 每个路由桶都会走 child()，全部订阅过一次切换就是 N 行日志
    for (let i = 0; i < 10; i++) parent.child({});
    expect(app.subscriptionCount).toBe(1);
  });

  it('child 共享 memoryFallback（降级模式不能各算各的桶）', () => {
    const app = makeApp();
    const Store = createBoundStore(app);
    const parent = new Store({});
    const child = parent.child({});

    expect(child.memoryFallback).toBe(parent.memoryFallback);
  });

  it('启动结束只打一条汇总，不再出现「实例数已达」', async () => {
    const app = makeApp();
    const Store = createBoundStore(app);
    const parent = new Store({});
    parent.child({});
    parent.child({});

    await app.fireReady();

    const summary = infos.filter(m => m.includes('限流存储就绪'));
    expect(summary).toHaveLength(1);
    // 文案要能自解释：父 1 + 路由桶 N，读者不必再去翻源码猜这个数是什么
    expect(summary[0]).toMatch(/父 1 \+ 路由桶 \d+/);
    expect(warnings.some(m => m.includes('实例数已达'))).toBe(false);
  });

  it('实例数异常增长（>500）时才 warn —— 那才是"运行期反复注册路由"的特征', async () => {
    const app = makeApp();
    const Store = createBoundStore(app);
    const parent = new Store({});
    const children = [];
    for (let i = 0; i < 600; i++) children.push(parent.child({}));

    await app.fireReady();

    const abnormal = warnings.filter(m => m.includes('异常增长'));
    expect(abnormal).toHaveLength(1);
    expect(abnormal[0]).toMatch(/限流存储实例 \d+ 个/);
    // 超过阈值时不应再打"就绪"（避免两条互相矛盾的日志）
    expect(infos.filter(m => m.includes('限流存储就绪')).some(m => /异常/.test(m))).toBe(false);

    // 还原模块级计数，避免影响同文件后续用例
    for (const c of children) c.close();
    parent.close();
  });
});
