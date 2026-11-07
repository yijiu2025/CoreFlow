/**
 * 速率限制（测试 `framework/ingress/firewall/engine/detectors/rate-limiter.js` 真身）
 *
 * 覆盖两部分：
 *   - `trackRequestCount()`：Bot 检测用的 60s 滑窗计数（内存、按 IP 隔离、封顶）；
 *   - `checkRateLimit()`：**计数交给 @fastify/rate-limit 的 createRateLimit**，
 *     本函数只在超限时写自动封禁并抛 429。
 *
 * ⚠️ 2026-11-02 重写：旧实现自己维护 Redis ZSET 滑窗（`consumeRateWindow`），
 * 且超限时 `setBlock('<路径>:<ip>')` 写的是**非 IP 键**，封禁从未生效。
 * 现在用库计数、用真实 IP 落封禁，本文件同时钉住这两点。
 *
 * 外部依赖（配置 / 封禁写入）用 mock 替换，被测的是真实模块。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-11-02 计数改为库 createRateLimit，重写 checkRateLimit 用例
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

/** 内存滑窗的共享 Map（由 mock 的 shared 模块提供，等价于生产里的单例） */
const timestamps = new Map();

/** 可通过用例改写的配置与封禁桩 */
const cfg = { defense: { enableEndpointRateLimit: true } };
const calls = { setBlock: [] };

jest.unstable_mockModule('../framework/ingress/firewall/util/shared.js', () => ({
  getConfig: () => cfg,
  ipRequestTimestamps: timestamps
}));

jest.unstable_mockModule('../framework/ingress/firewall/block-manager.js', () => ({
  setBlock: async (ip, meta) => {
    calls.setBlock.push({ ip, meta });
  }
}));

const { trackRequestCount, checkRateLimit } =
  await import('../framework/ingress/firewall/engine/detectors/rate-limiter.js');

beforeEach(() => {
  timestamps.clear();
  calls.setBlock.length = 0;
  cfg.defense.enableEndpointRateLimit = true;
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
    expect(trackRequestCount('10.0.0.9')).toBe(1);

    jest.useRealTimers();
  });

  test('单 IP 窗口内的时间戳数组封顶，计数饱和而不是无限增长', () => {
    let last = 0;
    for (let i = 0; i < 1200; i++) last = trackRequestCount('10.0.0.99');

    expect(last).toBe(1000);
    expect(timestamps.get('10.0.0.99')).toHaveLength(1000);
  });
});

describe('checkRateLimit：库计数 + 超限落封禁', () => {
  /** 构造带 server.createRateLimit 的假请求；capture 记录限流器参数 */
  function makeRequest({ ip = '203.0.113.9', status = {}, capture = [] } = {}) {
    const finalStatus = { isAllowed: false, isExceeded: false, ttlInSeconds: 60, ...status };
    return {
      ip,
      server: {
        createRateLimit: opts => {
          capture.push(opts);
          return async () => ({ ...finalStatus });
        }
      }
    };
  }

  test('端点级开关关闭：直接放行，且不创建限流器（不碰存储）', async () => {
    cfg.defense.enableEndpointRateLimit = false;
    const capture = [];
    const req = makeRequest({ capture });

    await expect(checkRateLimit(req, { keyPrefix: 'OFF', limit: 1 })).resolves.toBe(true);
    expect(capture).toHaveLength(0);
    expect(calls.setBlock).toHaveLength(0);
  });

  test('插件未注册（两个开关都关）：没有计数器可用，放行而不是报错', async () => {
    const req = { ip: '203.0.113.9', server: {} };
    await expect(checkRateLimit(req, { keyPrefix: 'NOSRV' })).resolves.toBe(true);
  });

  test('未超限：放行，且把 max / 窗口毫秒 / 键前缀正确传给库', async () => {
    const capture = [];
    const req = makeRequest({ capture });

    await expect(checkRateLimit(req, { keyPrefix: 'OK', limit: 5, window: 30 })).resolves.toBe(true);

    expect(capture).toHaveLength(1);
    expect(capture[0].max).toBe(5);
    expect(capture[0].timeWindow).toBe(30_000);
    // 键 = 前缀 + 真实 IP（不同规则各成一桶）
    expect(capture[0].keyGenerator({ ip: '1.2.3.4' })).toBe('OK:1.2.3.4');
    expect(calls.setBlock).toHaveLength(0);
  });

  test('超出上限：按**真实 IP** 落一条有时限的封禁，并抛 429 + Retry-After', async () => {
    const req = makeRequest({ status: { isExceeded: true, ttlInSeconds: 42 } });

    await expect(checkRateLimit(req, { keyPrefix: 'BAN', limit: 5, blockTime: 120 })).rejects.toMatchObject({
      statusCode: 429,
      headers: { 'Retry-After': '42' }
    });

    expect(calls.setBlock).toHaveLength(1);
    const { ip, meta } = calls.setBlock[0];
    // 回归：旧实现写的是 `<路径>:<ip>`，永远匹配不到真实 IP
    expect(ip).toBe('203.0.113.9');
    expect(meta).toMatchObject({ status: 'BLOCKED', source: 'auto', permanent: false });
    expect(meta.expiresAt - meta.createdAt).toBe(120_000);
  });

  test('库没给有效 ttl 时，Retry-After 用 blockTime 兜底', async () => {
    const req = makeRequest({ status: { isExceeded: true, ttlInSeconds: undefined } });

    await expect(checkRateLimit(req, { keyPrefix: 'TTLBAN', limit: 1, blockTime: 77 })).rejects.toMatchObject({
      headers: { 'Retry-After': '77' }
    });
  });

  test('命中 allowList（isAllowed=true）：放行，不落封禁', async () => {
    const req = makeRequest({ status: { isAllowed: true } });

    await expect(checkRateLimit(req, { keyPrefix: 'ALLOWED' })).resolves.toBe(true);
    expect(calls.setBlock).toHaveLength(0);
  });
});
