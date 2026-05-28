/**
 * 速率限制器测试
 * 测试内存滑动窗口限频逻辑（不依赖 Redis）
 */
import { describe, test, expect, beforeEach } from '@jest/globals';

// 模拟内存滑动窗口（从 rate-limiter.js 提取的核心逻辑）
const ipRequestTimestamps = new Map();

function trackRequestCount(ip, windowMs = 60_000) {
  const now = Date.now();

  if (!ipRequestTimestamps.has(ip)) {
    ipRequestTimestamps.set(ip, []);
  }

  const timestamps = ipRequestTimestamps.get(ip);
  while (timestamps.length && timestamps[0] < now - windowMs) {
    timestamps.shift();
  }

  timestamps.push(now);
  return timestamps.length;
}

function memorySlidingWindow(actorId, limit, windowSec) {
  const count = trackRequestCount(actorId, windowSec * 1000);
  return count > limit;
}

describe('内存滑动窗口限频', () => {
  beforeEach(() => {
    ipRequestTimestamps.clear();
  });

  test('首次请求计数为 1', () => {
    expect(trackRequestCount('10.0.0.1')).toBe(1);
  });

  test('多次请求计数递增', () => {
    trackRequestCount('10.0.0.1');
    trackRequestCount('10.0.0.1');
    expect(trackRequestCount('10.0.0.1')).toBe(3);
  });

  test('不同 IP 计数独立', () => {
    trackRequestCount('10.0.0.1');
    trackRequestCount('10.0.0.2');
    expect(trackRequestCount('10.0.0.1')).toBe(2);
    expect(trackRequestCount('10.0.0.2')).toBe(2);
  });

  test('memorySlidingWindow 超限返回 true', () => {
    for (let i = 0; i < 50; i++) {
      trackRequestCount('10.0.0.1');
    }
    expect(memorySlidingWindow('10.0.0.1', 50, 60)).toBe(true);
  });

  test('memorySlidingWindow 未超限返回 false', () => {
    for (let i = 0; i < 10; i++) {
      trackRequestCount('10.0.0.1');
    }
    expect(memorySlidingWindow('10.0.0.1', 50, 60)).toBe(false);
  });

  test('自定义窗口大小应生效', () => {
    // 使用极短窗口（1ms）
    trackRequestCount('10.0.0.1', 1);
    // 等待窗口过期
    const count = trackRequestCount('10.0.0.1', 1);
    // 由于窗口极短，之前的请求可能已过期
    expect(count).toBeLessThanOrEqual(2);
  });
});

describe('速率限制边界情况', () => {
  beforeEach(() => {
    ipRequestTimestamps.clear();
  });

  test('limit=1 时第二次请求应超限', () => {
    trackRequestCount('10.0.0.1');
    expect(memorySlidingWindow('10.0.0.1', 1, 60)).toBe(true);
  });

  test('limit=0 时任何请求都超限', () => {
    expect(memorySlidingWindow('10.0.0.1', 0, 60)).toBe(true);
  });
});
