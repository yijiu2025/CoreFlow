/**
 * framework/redis withTimeout 回归守卫
 *
 * 背景（真实事故）：原实现用 `result.finally(() => clearTimeout(timer))` 收尾。
 * finally 会派生出一个**被丢弃的** promise，主 promise 一旦 reject，这个孤儿 promise
 * 也以同一理由 reject 而无人处理 —— 在 Node 默认的 --unhandled-rejections=throw 下，
 * 整个进程会直接终止。表现是「Redis 一次普通的命令错误（如对 hash 键 GET 的 WRONGTYPE）
 * 升级成整个服务崩溃」，且崩溃栈指向 node-redis 解码器，排查成本极高。
 *
 * 本文件锁定两件事：
 *   1. 行为：被包装 promise 拒绝时，不得产生任何 unhandledRejection；
 *   2. 源码：不得再使用 `x.finally(` 作为竞速收尾（防止回潮）。
 *
 * @author yijiu2025
 * @since 2026-09-15
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTimeout } from '../../../framework/redis/utils.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UTILS_PATH = path.resolve(HERE, '../../../framework/redis/utils.js');

/** 收集一段时间内发生的 unhandledRejection */
async function collectUnhandled(fn, settleMs = 30) {
  const events = [];
  const onUnhandled = reason => events.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await fn();
    // 未处理拒绝是在微任务清空后才上报的，必须让出事件循环再统计
    await new Promise(r => setTimeout(r, settleMs));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  return events;
}

afterEach(() => {
  jest.useRealTimers();
});

describe('withTimeout', () => {
  it('正常完成：透传结果', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('超时：以 code=TIMEOUT 拒绝', async () => {
    jest.useFakeTimers();
    const never = new Promise(() => {});
    const p = withTimeout(never, 1000);
    p.catch(() => {}); // 断言前先挂处理者，避免中间态被判为未处理拒绝
    jest.advanceTimersByTime(1000);
    await expect(p).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('正常完成后不残留定时器（否则一次性 CLI 进程无法自然退出）', async () => {
    jest.useFakeTimers();
    await withTimeout(Promise.resolve(1), 5000);
    // 若收尾逻辑没清掉定时器，这里会 > 0
    expect(jest.getTimerCount()).toBe(0);
  });

  it('【回归】被包装的 promise 拒绝时，不产生任何 unhandledRejection', async () => {
    const boom = new Error('redis 命令错误，例如 WRONGTYPE');

    const events = await collectUnhandled(async () => {
      // 调用方正常处理即可；问题在于库内部额外漏出一个孤儿 promise
      await withTimeout(Promise.reject(boom), 1000).catch(() => {});
    });

    expect(events).toHaveLength(0);
  });

  it('【回归】多次连续失败也不会累积未处理拒绝', async () => {
    const events = await collectUnhandled(async () => {
      for (let i = 0; i < 5; i++) {
        await withTimeout(Promise.reject(new Error(`boom ${i}`)), 1000).catch(() => {});
      }
    });

    expect(events).toHaveLength(0);
  });

  it('超时先到、被包装 promise 后拒绝，也不产生未处理拒绝', async () => {
    const events = await collectUnhandled(async () => {
      let rejectLater;
      const slow = new Promise((_, reject) => {
        rejectLater = reject;
      });
      await withTimeout(slow, 10).catch(() => {});
      // 竞速已结束，此时原 promise 才拒绝：必须有处理者
      rejectLater(new Error('late rejection'));
    }, 50);

    expect(events).toHaveLength(0);
  });

  it('非法超时值退化为默认值，而不是「立即超时」', async () => {
    // 历史写法 setTimeout(fn, null) 等价 0ms → 每次调用都超时。
    // 这里要求 null / 0 / NaN 都按默认超时处理，保证正常操作不被误杀。
    for (const bad of [null, 0, -1, NaN, 'abc', undefined]) {
      await expect(withTimeout(Promise.resolve('v'), bad)).resolves.toBe('v');
    }
  });

  it('【源码守卫】不得用 `x.finally(` 作为竞速收尾（孤儿 promise 会漏出未处理拒绝）', () => {
    // 先剥离注释：注释里会解释「为什么不用 .finally」，不应被当成违例；
    // 同时避免把解释文字当成真实代码放过真违例。
    const stripped = fs
      .readFileSync(UTILS_PATH, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // 行注释（[^:] 避免误伤 http://）

    const offenders = stripped
      .split('\n')
      .map((text, i) => ({ text, line: i + 1 }))
      .filter(l => /\.finally\s*\(/.test(l.text));

    expect(offenders.map(l => `${l.line}: ${l.text.trim()}`).join('\n')).toBe('');
  });
});
