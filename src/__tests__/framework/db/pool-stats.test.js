/**
 * 连接池状态读取单元测试
 *
 * 为什么要专门测字段名映射：
 * sequelize-pool 的 getter 叫 `maxSize` / `waiting`，**不是**直觉上的 `max` / `pending`。
 * 若按直觉写，取到的是 `undefined` —— 而 `undefined` 在 JSON.stringify 里会让整个键消失，
 * 于是表现为"指标字段不见了"却不报任何错。这类回归只能靠断言钉住。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

import { describe, it, expect } from '@jest/globals';
import { sequelize, getPoolStats } from '../../../framework/db/index.js';

/** 临时替换 connectionManager.pool，跑完必须还原（避免污染同进程内其他用例） */
function withPool(fakePool, fn) {
  const cm = sequelize.connectionManager;
  const original = cm.pool;
  cm.pool = fakePool;
  try {
    return fn();
  } finally {
    cm.pool = original;
  }
}

describe('连接池状态 · 字段名契约', () => {
  it('按 sequelize-pool 的真实字段名映射（maxSize / waiting，而非 max / pending）', () => {
    const stats = withPool({ size: 7, available: 3, using: 4, waiting: 2, maxSize: 10, minSize: 2 }, () =>
      getPoolStats()
    );

    expect(stats).toEqual({ maxSize: 10, minSize: 2, size: 7, available: 3, using: 4, waiting: 2 });
    // 显式钉住"不是直觉命名"：写错会静默变 undefined，JSON 里整个键消失
    expect(stats.max).toBeUndefined();
    expect(stats.pending).toBeUndefined();
  });

  it('waiting > 0 表示饱和，是可直接用于告警的信号', () => {
    const stats = withPool({ size: 10, available: 0, using: 10, waiting: 5, maxSize: 10, minSize: 2 }, () =>
      getPoolStats()
    );
    expect(stats.waiting).toBe(5);
    expect(stats.available).toBe(0);
  });
});

describe('连接池状态 · 形态不符时必须优雅返回 null', () => {
  it('池已创建但空闲（无 DB 的测试环境）时，返回真实计数而非 null 或假数据', () => {
    // 实测更正：Sequelize 在**构造时**就 initPools()，并非惰性创建 ——
    // 因此测试环境里 pool 是存在的，只是 size/using/waiting 全为 0。
    // （初版断言"返回 null"是错的，被这条用例拦下。）
    const stats = getPoolStats();
    expect(stats).not.toBe(null);
    expect(typeof stats.size).toBe('number');
    expect(typeof stats.available).toBe('number');
    expect(typeof stats.using).toBe('number');
    expect(typeof stats.waiting).toBe('number');
    // maxSize/minSize 来自 DB_POOL_MAX / DB_POOL_MIN（未配置时是 10 / 2）
    expect(stats.maxSize).toBeGreaterThan(0);
    expect(stats.waiting).toBe(0); // 空闲 → 无排队
  });

  it('读写分离形态（{ read, write } 子池）返回 null 而不是崩溃', () => {
    const stats = withPool({ read: {}, write: {} }, () => getPoolStats());
    expect(stats).toBe(null);
  });

  it('形态为普通对象但缺 size 数值时返回 null', () => {
    expect(withPool({ available: 3 }, () => getPoolStats())).toBe(null);
    expect(withPool({ size: 'ten' }, () => getPoolStats())).toBe(null);
    expect(withPool(null, () => getPoolStats())).toBe(null);
  });
});
