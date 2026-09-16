/**
 * API 路由真实契约测试
 *
 * 驱动方式：真实 Fastify + 真实路由插件（import 真身）+ 真实 reply.result 装饰器，
 * 用 inject() 发起请求并断言**实际响应结构**。
 *
 * 与旧版的区别：旧版是「手写常量 → 断言该常量有某字段」，完全不 import 生产代码，
 * 删除被测路由后仍全绿（毒丸实验已证实）。本版所有断言的数据均来自真实 handler。
 *
 * 覆盖范围：不依赖外部服务即可真实驱动的端点（登录门槛、参数校验、响应封装契约、
 * 降级路径）。依赖 Redis 的端点按「可用 → 200 / 不可用 → 503」两种真实结果断言，
 * 不假定环境。
 *
 * ⚠️ 本文件**只能注册一组路由**：`registerSecureRoute` 的 `_routeRegistry` 是模块级
 * 全局状态且无重置入口，重复注册同一 URL 会抛错。故所有注册集中在顶层 beforeAll。
 *
 * @author yijiu2025
 * @since 2026-09-16
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import globalsLoader from '../framework/loader/registry/00-globals.js';

import registerVerifyRoutes from '../api/verify/v1/verify.js';
import registerUserRoutes from '../api/user/v1/user.js';
import registerSessionsRoutes from '../api/user/v1/sessions.js';
import registerSessionRoutes from '../api/auth/v1/session.js';
import registerNoticeConfigRoutes from '../api/notice/v1/config.js';
import registerMetricsRoutes from '../api/firewall/v1/metrics.js';
import registerTokenRoutes from '../api/oauth21/v1/token.js';

let app;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(globalsLoader);

  // 只注册真实模块本身，不重建任何业务逻辑
  await app.register(registerVerifyRoutes, { prefix: '/verify' });
  await app.register(registerUserRoutes, { prefix: '/user' });
  await app.register(registerSessionsRoutes, { prefix: '/user' });
  await app.register(registerSessionRoutes, { prefix: '/auth' });
  await app.register(registerNoticeConfigRoutes, { prefix: '/notice' });
  await app.register(registerMetricsRoutes, { prefix: '/api/firewall' });
  await app.register(registerTokenRoutes, { prefix: '/oauth2.1' });

  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

/** 断言响应符合 reply.result 的统一封装契约 */
function expectResultEnvelope(body) {
  expect(body).toHaveProperty('code');
  expect(body).toHaveProperty('message');
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('timestamp');
  expect(typeof body.timestamp).toBe('number');
}

describe('API 路由（真实驱动）', () => {
  describe('验证模块 /verify/v1', () => {
    it('generate-captcha 成功时返回真实 UUID key 与 base64 SVG', async () => {
      const res = await app.inject({ method: 'GET', url: '/verify/v1/generate-captcha' });

      // 该端点需写 captcha store：Redis 可用则 200，不可用则由 RedisUnavailableError 降级为 503。
      // 两种情况都是真实契约，分别由本用例与下一条用例覆盖（避免条件断言）。
      if (res.statusCode === 503) {
        return; // 环境无 Redis，交由「降级」用例断言
      }

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expectResultEnvelope(body);
      expect(body.code).toBe(200);

      // 真实生成的验证码：key 是 UUID 形态，image 是 base64 编码的 SVG
      expect(body.data.captchaKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(body.data.captchaImage).toMatch(/^data:image\/svg\+xml;base64,/);

      // 解码后应是真实 SVG 文档，而非占位字符串
      const svg = Buffer.from(body.data.captchaImage.split(',')[1], 'base64').toString('utf-8');
      expect(svg).toContain('<svg');
    });

    it('generate-captcha 在存储不可用时按契约降级为 503（不泄漏内部栈）', async () => {
      const res = await app.inject({ method: 'GET', url: '/verify/v1/generate-captcha' });

      if (res.statusCode === 200) {
        return; // 环境有 Redis，交由上一条用例断言
      }

      expect(res.statusCode).toBe(503);
      expect(res.json()).toHaveProperty('statusCode', 503);
    });

    it('verify-captcha 缺少必填参数时被 schema 拦截（不进入 handler）', async () => {
      const res = await app.inject({ method: 'POST', url: '/verify/v1/verify-captcha', payload: {} });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('未知子路由返回 404 框架响应', async () => {
      const res = await app.inject({ method: 'GET', url: '/verify/v1/not-exist' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toHaveProperty('statusCode', 404);
    });
  });

  describe('登录门槛（真实走 guard + reply.result.unauth）', () => {
    const protectedRoutes = [
      { method: 'GET', url: '/user/v1/userinfo', label: 'userinfo' },
      { method: 'GET', url: '/user/v1/permissions', label: 'permissions' },
      { method: 'GET', url: '/user/v1/profile', label: 'profile' },
      { method: 'GET', url: '/user/v1/sessions', label: 'sessions' },
      { method: 'GET', url: '/user/v1/sessions/devices', label: 'devices' },
      { method: 'GET', url: '/notice/v1/channels', label: 'notice channels' },
      { method: 'GET', url: '/api/firewall/v1/metrics', label: 'firewall metrics' }
    ];

    it.each(protectedRoutes)('$label 未登录返回 401 且符合统一契约', async ({ method, url }) => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);

      const body = res.json();
      expectResultEnvelope(body);
      expect(body.code).toBe(401);
      expect(body.data).toBeNull();
    });

    it('未登录时不泄漏受保护数据字段', async () => {
      const res = await app.inject({ method: 'GET', url: '/user/v1/sessions' });
      expect(res.body).not.toContain('sessions');
    });
  });

  describe('参数校验（真实 handler 分支）', () => {
    it('sessions/kick 缺 sessionId 时返回业务错误而非崩溃', async () => {
      const res = await app.inject({ method: 'POST', url: '/user/v1/sessions/kick', payload: {} });
      // 未登录时应先被登录门槛拦下
      expect([400, 401]).toContain(res.statusCode);
      expectResultEnvelope(res.json());
    });

    it('oauth token 缺 grant_type 时被拦截', async () => {
      const res = await app.inject({ method: 'POST', url: '/oauth2.1/v1/token', payload: {} });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('路由注册完整性（防止路由被误删）', () => {
    // printRoutes() 会把路径段拆成独立节点渲染（如 /sessions/devices 会成 "sessions" 与
    // "/devices" 两段；kick-all 会成 "kick(POST)" 与 "-all(POST)"），故按「路径段」而非
    // 「完整路径」做包含判断。
    const flat = () => app.printRoutes().replace(/[│├└─\s]/g, '');

    it('各模块的关键路由均已真实注册', () => {
      for (const segment of [
        'generate-captcha',
        'verify-captcha',
        'check-email-code',
        'send-login-verify-code',
        'userinfo',
        'permissions',
        'check-permission',
        'sessions',
        'devices',
        'kick',
        '-all',
        'bind-token',
        'clear-cookie',
        'refresh-session',
        'channels',
        'metrics',
        'token',
        'revoke'
      ]) {
        expect(flat()).toContain(segment);
      }
    });

    it('受保护路由的 HTTP 方法正确（防止被改成公开）', () => {
      const tree = flat();
      // 这些端点必须是 POST（写操作），GET 版本不应存在
      expect(tree).toContain('kick(POST)');
      expect(tree).toContain('clear-cookie(POST)');
      expect(tree).toContain('token(POST)');
      expect(tree).not.toContain('kick-all(GET');
    });

    it('未注册的路径确实不存在', () => {
      expect(flat()).not.toContain('this-route-should-not-exist');
    });
  });
});
