/**
 * 面板路由的端点级限频契约（2026-11-05）
 *
 * 背景：`/api/firewall/v1/monitor|metrics|export|apiconfigs` 之前**一条都没有**端点级限频，
 * 面板被刷时只能靠全局限流（600/60s，全站共享）兜底 —— 也就是刷面板能把全站额度吃光。
 *
 * 实现选了「组级默认 + 逐路由自动分桶」，所以本测试要守住三件事：
 *   ① 这四个组注册出来的**每一条** HTTP 路由都带 config.rateLimit（漏一条就等于该端点裸奔）；
 *   ② groupId 互不相同（@fastify/rate-limit 的 groupId 决定桶，重复即共用额度）；
 *   ③ 路由自己声明的 rateLimit 优先于组默认（如 challenge 的 10/20 不能被组默认盖掉）。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

/** 捕获到的路由注册 */
const routes = [];

/** 最小 fastify 替身：guard 只用到这些方法 */
function makeFastify() {
  /** 记录每次注册 */
  return {
    get: (url, opts) => routes.push({ method: 'GET', url, opts }),
    post: (url, opts) => routes.push({ method: 'POST', url, opts }),
    patch: (url, opts) => routes.push({ method: 'PATCH', url, opts }),
    put: (url, opts) => routes.push({ method: 'PUT', url, opts }),
    delete: (url, opts) => routes.push({ method: 'DELETE', url, opts })
  };
}

describe('面板路由：端点级限频必须落到每一条路由上', () => {
  beforeAll(async () => {
    const fastify = makeFastify();
    // 顺序与 loader 一致（registerGroupMetadata 会改变当前组上下文）
    for (const file of ['monitor', 'metrics', 'export', 'apiConfig']) {
      const mod = await import(`../api/firewall/v1/${file}.js`);
      await mod.default(fastify);
    }
  });

  /** HTTP 路由（WS 走 get + { websocket: true }，不计入端点限频） */
  const httpRoutes = () => routes.filter(r => !r.opts?.websocket);

  it('四个面板组一共注册了 30+ 条 HTTP 路由（数量兜底，防模块整体失效）', () => {
    expect(httpRoutes().length).toBeGreaterThanOrEqual(30);
  });

  it('每一条都带 config.rateLimit（max / timeWindow / groupId 齐全）', () => {
    const missing = httpRoutes()
      .filter(r => !r.opts?.config?.rateLimit)
      .map(r => `${r.method} ${r.url}`);
    expect(missing).toEqual([]);

    for (const r of httpRoutes()) {
      const { max, timeWindow, groupId } = r.opts.config.rateLimit;
      expect(typeof max).toBe('number');
      expect(max).toBeGreaterThan(0);
      expect(typeof timeWindow).toBe('string');
      expect(timeWindow.length).toBeGreaterThan(0);
      expect(typeof groupId).toBe('string');
      expect(groupId.length).toBeGreaterThan(0);
    }
  });

  it('groupId 互不相同（重复 = 两个端点共用同一个桶，等于互相吃额度）', () => {
    const ids = httpRoutes().map(r => r.opts.config.rateLimit.groupId);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('groupId 带组名前缀，能从限流日志反查到是哪个面板', () => {
    // 组名来自各自的 registerGroupMetadata（monitor / metrics / export / apiConfigs）
    const prefixes = ['firewall-monitor-', 'metrics-', 'export-', 'apiConfigs-'];
    for (const r of httpRoutes()) {
      const { groupId } = r.opts.config.rateLimit;
      expect(prefixes.some(p => groupId.startsWith(p))).toBe(true);
    }
  });

  it('路由自己声明的 rateLimit 优先于组默认（challenge 的 10/20 不能被组默认盖掉）', async () => {
    const fastify = makeFastify();
    const { default: registerChallenge } = await import('../api/firewall/v1/challenge.js');
    await registerChallenge(fastify);

    // challenge 组没声明组默认限频，两条路由各自声明
    const issued = routes.filter(r => r.url?.endsWith('/challenge/issue'));
    const verified = routes.filter(r => r.url?.endsWith('/challenge/verify'));
    expect(issued[0].opts.config.rateLimit).toMatchObject({ max: 10, groupId: 'challenge-issue' });
    expect(verified[0].opts.config.rateLimit).toMatchObject({ max: 20, groupId: 'challenge-verify' });
  });

  it('没声明组默认限频的组不会被误加（开关是按组显式打开的）', async () => {
    const { registerGroupMetadata, registerSecureRoute } = await import('../api/guard.js');
    const fastify = makeFastify();
    const before = routes.length;

    registerGroupMetadata({ name: 'plain-test-group', prefix: '/v1/plain-test', requireLogin: false });
    registerSecureRoute(fastify, {
      name: 'noLimitRoute',
      method: 'GET',
      url: '/no-limit',
      handler: async () => ({ ok: true })
    });

    const added = routes.splice(before);
    expect(added).toHaveLength(1);
    expect(added[0].opts.config.rateLimit).toBeUndefined();
  });
});
