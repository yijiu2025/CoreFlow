/**
 * 速率限制（测试 `app/firewall/engine/detectors/rate-limiter.js` 真身）
 *
 * ⚠️ 为什么重写：本文件的前身把限流算法**抄进了测试**（自己维护一个 Map、
 * 自己实现滑动窗口），然后断言自己抄的那份实现。生产代码怎么改都不会影响结论，
 * 甚至把 `detectors/rate-limiter.js` 删掉它依然全绿。
 *
 * 现在测的是真实模块的对外语义：
 *   - `trackRequestCount()`：60s 滑窗计数、按 IP 隔离、过期即出窗；
 *   - `checkRateLimit()`：开关关闭时直接放行（不碰存储）、已封禁/挑战的状态映射、
 *     超限时落封禁并抛 429 + Retry-After。
 *
 * 后者的存储与配置用 mock 替换：本文件验的是**判定与错误契约**，
 * Redis Lua 的原子性由 `scripts/verify/` 的跨进程关卡负责，两者不重复。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 重写为真身测试（U18）
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

/** 内存滑窗的共享 Map（由 mock 的 shared 模块提供，等价于生产里的单例） */
const timestamps = new Map();

/** 可通过用例改写的配置与存储桩 */
const cfg = { defense: { enableRateLimit: true } };
const calls = {
  readAccessState: [],
  consumeRateWindow: [],
  setBlock: []
};
let accessState = { ipBlock: null, fpBlock: null };
let windowCount = 1;

jest.unstable_mockModule('../app/firewall/util/shared.js', () => ({
  getConfig: () => cfg,
  ipRequestTimestamps: timestamps
}));

jest.unstable_mockModule('../app/firewall/util/redis.js', () => ({
  rel: { rateLimit: actor => `rate:${actor}` },
  readAccessState: async args => {
    calls.readAccessState.push(args);
    return accessState;
  },
  consumeRateWindow: async (key, windowMs) => {
    calls.consumeRateWindow.push({ key, windowMs });
    return windowCount;
  }
}));

jest.unstable_mockModule('../app/firewall/dao/block-manager.js', () => ({
  setBlock: async (actor, meta) => {
    calls.setBlock.push({ actor, meta });
  }
}));

const { trackRequestCount, checkRateLimit } = await import('../app/firewall/engine/detectors/rate-limiter.js');

beforeEach(() => {
  timestamps.clear();
  calls.readAccessState.length = 0;
  calls.consumeRateWindow.length = 0;
  calls.setBlock.length = 0;
  accessState = { ipBlock: null, fpBlock: null };
  windowCount = 1;
  cfg.defense.enableRateLimit = true;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('trackRequestCount：60 秒滑窗计数', () => {
  test('首次请求计数为 1，之后递增', () => {
    expect(trackRequestCount('10.0.0.1')).toBe(1);
    expect(trackRequestCount('10.0.0.1')).toBe(2);
    expect(trackRequestCount('10.0.0.1')).toBe(3);
  });

  test('不同 IP 各自独立计数', () => {
    trackRequestCount('10.0.0.1');
    trackRequestCount('10.0.0.1');
    expect(trackRequestCount('10.0.0.2')).toBe(1);
    expect(trackRequestCount('10.0.0.1')).toBe(3);
  });

  test('超过 60 秒的旧记录出窗（计数回落而不是只增不减）', () => {
    jest.useFakeTimers({ now: new Date('2026-10-30T00:00:00Z') });

    trackRequestCount('10.0.0.9');
    trackRequestCount('10.0.0.9');
    expect(trackRequestCount('10.0.0.9')).toBe(3);

    jest.advanceTimersByTime(61_000);
    // 三条旧记录全部出窗，本次只算 1
    expect(trackRequestCount('10.0.0.9')).toBe(1);
  });
});

describe('checkRateLimit：判定与错误契约', () => {
  test('开关关闭时直接放行，且不访问存储', async () => {
    cfg.defense.enableRateLimit = false;

    await expect(checkRateLimit('/api/x:1.1.1.1')).resolves.toBe(true);
    expect(calls.readAccessState).toHaveLength(0);
    expect(calls.consumeRateWindow).toHaveLength(0);
  });

  test('已处于挑战态：抛 statusCode=200 + isChallenge（让前端出验证码，不是报错）', async () => {
    accessState = { ipBlock: { status: 'CHALLENGE', ttlSec: 30 }, fpBlock: null };

    await expect(checkRateLimit('a')).rejects.toMatchObject({ statusCode: 200, isChallenge: true });
    // 挑战态不该再累计窗口，也不该重复落封禁
    expect(calls.consumeRateWindow).toHaveLength(0);
    expect(calls.setBlock).toHaveLength(0);
  });

  test('扫描器封禁映射为 403，Retry-After 取剩余 TTL', async () => {
    accessState = { ipBlock: { status: 'SCANNER', ttlSec: 42 }, fpBlock: null };

    await expect(checkRateLimit('a')).rejects.toMatchObject({
      statusCode: 403,
      headers: { 'Retry-After': '42' }
    });
  });

  test('普通封禁映射为 429；缺 TTL 时用 retryAfter 兜底', async () => {
    accessState = { ipBlock: { status: 'BLOCKED', ttlSec: 0 }, fpBlock: null };

    await expect(checkRateLimit('a', { retryAfter: 77 })).rejects.toMatchObject({
      statusCode: 429,
      headers: { 'Retry-After': '77' }
    });
  });

  test('未超限：放行，窗口按 window 秒换算成毫秒', async () => {
    windowCount = 3;

    await expect(checkRateLimit('/api/x:1.1.1.1', { limit: 5, window: 30 })).resolves.toBe(true);
    expect(calls.consumeRateWindow).toEqual([{ key: 'rate:/api/x:1.1.1.1', windowMs: 30_000 }]);
    expect(calls.setBlock).toHaveLength(0);
  });

  test('恰好等于 limit 仍放行（判据是 > limit，不是 >=）', async () => {
    windowCount = 5;
    await expect(checkRateLimit('a', { limit: 5 })).resolves.toBe(true);
    expect(calls.setBlock).toHaveLength(0);
  });

  test('超过 limit：落一条有时限的自动封禁，并抛 429 + Retry-After', async () => {
    windowCount = 6;

    await expect(checkRateLimit('actor-1', { limit: 5, blockTime: 120 })).rejects.toMatchObject({
      statusCode: 429,
      headers: { 'Retry-After': '120' }
    });

    expect(calls.setBlock).toHaveLength(1);
    const { actor, meta } = calls.setBlock[0];
    expect(actor).toBe('actor-1');
    expect(meta).toMatchObject({ status: 'BLOCKED', source: 'auto', permanent: false });
    expect(meta.expiresAt - meta.createdAt).toBe(120_000);
  });
});
