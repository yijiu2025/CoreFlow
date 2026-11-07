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

import globalsLoader from '../framework/lifecycle/loader/registry/00-globals.js';

import registerVerifyRoutes from '../api/verify/v1/verify.js';
import registerUserRoutes from '../api/user/v1/user.js';
import registerSessionsRoutes from '../api/user/v1/sessions.js';
import registerSessionRoutes from '../api/auth/v1/session.js';
import registerSavedAccountsRoutes from '../api/auth/v1/saved-accounts.js';
import registerVerifyChallengeRoutes from '../api/auth/v1/verify-challenge.js';
import registerLogoutRoutes from '../api/oauth21/v1/logout.js';
import registerDeactivationRoutes from '../api/user/v1/deactivation.js';
import registerNoticeConfigRoutes from '../api/notice/v1/config.js';
import registerMetricsRoutes from '../api/firewall/v1/metrics.js';
import registerTokenRoutes from '../api/oauth21/v1/token.js';

let app;
/** 捕获到的带 riskExempt 标志的路由配置（onRequest 钩子填充） */
const riskExemptSeen = [];

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(globalsLoader);

  // 捕获每个匹配路由的 config，供风险豁免声明位契约断言（onRequest 在路由匹配后执行）。
  // 必须在路由注册前 addHook：Fastify 封装语义下钩子只对"声明之后注册"的路由生效
  app.addHook('onRequest', async request => {
    const cfg = request.routeOptions?.config;
    if (cfg && cfg.riskExempt !== undefined) {
      riskExemptSeen.push({ url: request.routeOptions.url, riskExempt: cfg.riskExempt });
    }
  });

  // 只注册真实模块本身，不重建任何业务逻辑
  await app.register(registerVerifyRoutes, { prefix: '/verify' });
  await app.register(registerUserRoutes, { prefix: '/user' });
  await app.register(registerSessionsRoutes, { prefix: '/user' });
  await app.register(registerSessionRoutes, { prefix: '/auth' });
  await app.register(registerSavedAccountsRoutes, { prefix: '/auth' });
  await app.register(registerVerifyChallengeRoutes, { prefix: '/auth' });
  await app.register(registerLogoutRoutes, { prefix: '/oauth2.1' });
  await app.register(registerDeactivationRoutes, { prefix: '/user' });
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
    it('generate-captcha：成功时返回真实 UUID key 与 base64 SVG；存储不可用时按契约降级为 503', async () => {
      const res = await app.inject({ method: 'GET', url: '/verify/v1/generate-captcha' });
      const body = res.json();
      const ok = res.statusCode === 200;

      // 该端点需要写 captcha store。两种结果都是**真实契约**：
      //   · 存储可用（真 Redis 或进程内 MapStore）→ 200 + 真实 SVG
      //   · 配了 Redis 但连不上 → 503，且**不得**把驱动错误/内部栈吐给调用方
      // 旧版本写成 `if (res.statusCode === 503) return;`，于是任何环境下必有一条用例
      // 空跑却显示 PASS（本地空跑"降级"、CI 空跑"成功"）—— 等于半个用例不存在。
      // 这里用「一次断言表达两个分支各自必须成立的事实」，没有空跑分支：
      // 落到 404/500 等其它状态码会立刻失败（jest/no-conditional-expect 也不允许 if 里断言）。
      const svg = ok ? Buffer.from(String(body.data?.captchaImage || '').split(',')[1] || '', 'base64').toString() : '';
      const facts = {
        statusIsKnown: res.statusCode === 200 || res.statusCode === 503,
        uuidOk: ok
          ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.data?.captchaKey || '')
          : true,
        base64PrefixOk: ok ? String(body.data?.captchaImage || '').startsWith('data:image/svg+xml;base64,') : true,
        realSvg: ok ? svg.includes('<svg') : true,
        envelopeOk: ok ? body.code === 200 && typeof body.timestamp === 'number' : body.statusCode === 503,
        noDriverLeak: !/ECONNREFUSED|ETIMEDOUT|at .*\.js:\d+/.test(JSON.stringify(body))
      };

      expect(facts).toEqual({
        statusIsKnown: true,
        uuidOk: true,
        base64PrefixOk: true,
        realSvg: true,
        envelopeOk: true,
        noDriverLeak: true
      });
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

describe('风险豁免声明位（riskExempt）真实契约', () => {
  // 背景：豁免机制曾是 anomaly-detector 里的硬编码路径清单，腐烂出两条死路径
  // （'/auth/v1/logout'、'/auth/v1/deactivation' 不存在）+ 漏豁免真实登出。
  // 现为路由声明制：本组用例用**真实注册的路由**钉住每个豁免端点都声明了标志位。
  const EXEMPT_URLS = [
    '/auth/v1/bind-session', // iframe 换 sid
    '/auth/v1/clear-cookie', // 临时退出
    '/auth/v1/switch-account', // 切换账号
    '/auth/v1/saved-accounts/revoke', // 撤销免切凭证
    '/auth/v1/verify-challenge', // 人机验证自身
    '/oauth2.1/logout', // 显式登出（旧清单漏豁免 → 退不出登录死锁）
    '/user/v1/deactivation/apply', // 注销申请（旧清单前缀写错，从未生效）
    '/user/v1/deactivation/revoke' // 撤销注销
  ];

  for (const url of EXEMPT_URLS) {
    it(`POST ${url} 声明了 riskExempt: true`, async () => {
      // 触发路由匹配（handlers 自带来源/参数校验，未登录会在 handler 层被拒，
      // 这里只关心 onRequest 捕获到的 config 标志）
      await app.inject({ method: 'POST', url, payload: {} });
      const hit = riskExemptSeen.find(r => r.url === url);
      expect(hit).toBeDefined();
      expect(hit.riskExempt).toBe(true);
    });
  }

  it('verify-challenge 注册时已把真实 URL 回填给风险模块（兜底地址与真实路由一致）', async () => {
    // 行为验证：detectSessionRisk 不传 verifyUrl 时，兜底 = verify-challenge 注册时
    // 经 registerRiskVerifyUrl 回填的 guard 解析结果（本测试环境无 system 前缀 → /v1/verify-challenge）
    const { detectSessionRisk } = await import('../framework/security/auth/risk/anomaly-detector.js');
    const risk = await detectSessionRisk({
      userId: 1,
      deviceId: 'WEB-AbCdEfGhIjK-Ab3dE9',
      ip: '1.2.3.4',
      fingerprint: 'fp-x',
      baselineFingerprint: 'fp-y',
      baselineIp: '1.2.3.4'
    });
    expect(risk.level).toBe('warn');
    expect(risk.verify.url).toBe('/v1/verify-challenge');
  });
});
