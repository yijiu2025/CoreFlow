/**
 * 限频规则表 ↔ 真实路由表 的一致性守卫
 *
 * 为什么需要这条守卫：`sensitiveRateLimitPlugin` 是按 `request.url` **精确比对**的。
 * 规则表里写错一个路径不会报错、不会告警、也不会被任何其他测试发现 —— 它只是永远不命中，
 * 于是那条限频从未存在，而注释、文档、代码都还写着"已限频"。
 *
 * 真实发生过的事：`{ name: 'register', path: '/oauth2.1/register' }` —— 全仓没有这条路由。
 * 真实注册是 user 域的 `POST /user/v1/register`（另由该路由的 `config.rateLimit` 兜住），
 * 所以"注册 3 次/时"这条承诺在线上一天都没有生效过。
 *
 * 判据构造方式：**真的把 oauth21 认证路由模块注册进一个 Fastify 实例**，用 `onRoute` 钩子
 * 收集拼好的完整路径，再逐条比对规则表 —— 而不是拿源码字符串猜路径。
 *
 * @author yijiu2025
 * @since 2026-10-31
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';

import registerAuthRoutes from '../../api/oauth21/v1/auth/index.js';
import registerTokenRoutes from '../../api/oauth21/v1/token.js';
import {
  RATE_LIMIT_RULES,
  matchRule,
  isOAuth21Request,
  createIpRateLimiter
} from '../../app/oauth21/middleware/rate-limiter.js';

/** oauth21 域的真实前缀（与 src/api/oauth21/system.json 一致） */
const OAUTH21_PREFIX = '/oauth2.1';

/** @type {Set<string>} 真实注册出来的完整路径 */
const registered = new Set();
let app;

beforeAll(async () => {
  app = Fastify({ logger: false });

  // 用 onRoute 钩子收集「前缀 + 路由地址」拼好后的完整路径
  app.addHook('onRoute', route => {
    const method = Array.isArray(route.method) ? route.method[0] : route.method;
    if (typeof route.url === 'string') registered.add(route.url);
    if (route.path) registered.add(route.path);
    // 记下方法无关的路径集合即可；本文件只校验「路径存在」
    void method;
  });

  await app.register(registerAuthRoutes, { prefix: OAUTH21_PREFIX });
  await app.register(registerTokenRoutes, { prefix: OAUTH21_PREFIX });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

describe('限频规则表必须命中真实路由', () => {
  it('扫描范围有效（防路由注册写错导致本守卫空转）', () => {
    expect(registered.size).toBeGreaterThan(5);
    expect(registered.has('/oauth2.1/login')).toBe(true);
    expect(registered.has('/oauth2.1/mini-login')).toBe(true);
  });

  it('🔴 每条规则的每个 path 都必须是真实注册的路由（历史缺陷：/oauth2.1/register 不存在）', () => {
    const dead = [];
    for (const rule of RATE_LIMIT_RULES) {
      expect(Array.isArray(rule.paths)).toBe(true);
      for (const p of rule.paths) {
        if (!registered.has(p)) dead.push(`${rule.name} → ${p}`);
      }
    }
    expect(dead.join('\n')).toBe('');
  });

  it('规则名唯一（limiters 以 name 为键，重名会互相覆盖）', () => {
    const names = RATE_LIMIT_RULES.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('阈值必须是正整数且窗口为正（0/负数会让限频变成"永远放行"或"永远拒绝"）', () => {
    for (const rule of RATE_LIMIT_RULES) {
      expect(Number.isInteger(rule.maxRequests) && rule.maxRequests > 0).toBe(true);
      expect(Number.isInteger(rule.windowSec) && rule.windowSec > 0).toBe(true);
    }
  });

  it('登录类端点的阈值不超过 10 次/分（否则不构成防爆破）', () => {
    for (const name of ['login', 'miniLogin', 'verifyEmail']) {
      const rule = RATE_LIMIT_RULES.find(r => r.name === name);
      expect(rule).toBeDefined();
      expect(rule.maxRequests / (rule.windowSec / 60)).toBeLessThanOrEqual(10);
    }
  });
});

describe('matchRule / 作用域判定', () => {
  it('命中的路径返回对应规则', () => {
    expect(matchRule('/oauth2.1/login')?.name).toBe('login');
    expect(matchRule('/oauth2.1/qr/confirm')?.name).toBe('qrConfirm');
  });

  it('未登记的路径返回 null（不是抛错，也不是默认放行规则）', () => {
    expect(matchRule('/oauth2.1/register')).toBeNull(); // ⬅️ 历史死规则，不得复活
    expect(matchRule('/oauth2.1/token')).toBeNull();
    expect(matchRule('/user/v1/register')).toBeNull();
  });

  it('作用域闸门只认 /oauth2.1 前缀（/oauth2.10 不误命中）', () => {
    expect(isOAuth21Request('/oauth2.1/login')).toBe(true);
    expect(isOAuth21Request('/oauth2.1/login?x=1')).toBe(true);
    expect(isOAuth21Request('/oauth2.10/login')).toBe(false);
    expect(isOAuth21Request('/user/v1/login')).toBe(false);
    expect(isOAuth21Request('')).toBe(false);
  });
});

describe('限频器行为（内存降级路径，可确定性断言）', () => {
  let seq = 0;
  const freshLimiter = (max, windowSec) => createIpRateLimiter(`rule-test-${++seq}`, max, windowSec);

  it('超过阈值后拒绝并给出正整数 Retry-After', async () => {
    const limit = freshLimiter(2, 60);
    expect((await limit('198.51.100.10')).allowed).toBe(true);
    expect((await limit('198.51.100.10')).allowed).toBe(true);
    const blocked = await limit('198.51.100.10');
    expect(blocked.allowed).toBe(false);
    expect(Number.isInteger(blocked.retryAfter) && blocked.retryAfter > 0).toBe(true);
  });

  it('按 IP 隔离（一个人被限不影响另一个人）', async () => {
    const limit = freshLimiter(1, 60);
    expect((await limit('198.51.100.11')).allowed).toBe(true);
    expect((await limit('198.51.100.11')).allowed).toBe(false);
    expect((await limit('198.51.100.12')).allowed).toBe(true);
  });
});
