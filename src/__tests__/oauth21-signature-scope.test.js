/**
 * H5 签名中间件接线与作用域（U4）
 *
 * 背景：`guard.js` 会给所有 requireLogin 路由自动写 `config.requireSignature = true`，
 * 但**没有任何执行者**读取它 —— initOAuthMiddleware 从未被注册。配置看起来生效，
 * 实际签名校验从未发生（静默失效）。
 *
 * 本测试驱动真实的 `oauth21/config.js` init 与 `initOAuthMiddleware`，断言：
 * - init 之后 /oauth2.1 内声明 requireSignature 的路由真的开始校验签名
 * - 未声明 requireSignature 的公开路由不受影响
 * - /oauth2.1 之外的请求完全不受影响（作用域不外溢，避免误伤其他前端）
 * - `/oauth2.10` 这类同前缀不被当成 oauth21
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

jest.unstable_mockModule('../app/oauth21/middleware/rate-limiter.js', () => ({
  sensitiveRateLimitPlugin: async () => {}
}));

jest.unstable_mockModule('../app/oauth21/middleware/csrf.middleware.js', () => ({
  createCsrfProtectionPlugin: () => async () => {}
}));

jest.unstable_mockModule('../framework/redis/index.js', () => ({
  getStore: () => ({ get: async () => null, set: async () => {}, del: async () => 1 })
}));

const { default: oauth21Config } = await import('../app/oauth21/config.js');
const { isOAuth21Request } = await import('../app/oauth21/middleware/auth.middleware.js');

let app;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(cookie);

  // 与 10-apps loader 的接线保持一致：rootPlugins 注册在根作用域 ——
  // H5 签名 / CSRF / 限频三个钩子都必须在这一层才对全应用路由生效
  // （限频与 CSRF 在本文件里换成桩，只验证签名接线）。
  for (const plugin of oauth21Config.rootPlugins) await app.register(plugin);

  app.get('/oauth2.1/protected', { config: { requireSignature: true } }, async () => ({ ok: true }));
  app.get('/oauth2.1/public', async () => ({ ok: true }));
  app.get('/user/protected', { config: { requireSignature: true } }, async () => ({ ok: true }));
  app.get('/oauth2.10/protected', { config: { requireSignature: true } }, async () => ({ ok: true }));

  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

/** 一个尚未过期的 _m_h5_tk（格式 md5_expiredTime） */
const H5_COOKIE = { _m_h5_tk: `${'a'.repeat(64)}_${Date.now() + 600_000}` };

describe('作用域判定', () => {
  it('只认 /oauth2.1 及其子路径', () => {
    expect(isOAuth21Request('/oauth2.1')).toBe(true);
    expect(isOAuth21Request('/oauth2.1/token')).toBe(true);
    expect(isOAuth21Request('/oauth2.1x/token')).toBe(false);
    expect(isOAuth21Request('/oauth2.10/token')).toBe(false);
    expect(isOAuth21Request('/user/v1/userinfo')).toBe(false);
  });
});

describe('作用域内：requireSignature 真正生效', () => {
  it('已有 _m_h5_tk 但不带签名参数 → 403 signature_required', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth2.1/protected',
      cookies: H5_COOKIE
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'signature_required' });
  });

  it('时间戳超出窗口 → 403 request_expired', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth2.1/protected',
      cookies: H5_COOKIE,
      headers: { 'x-sign': 'a'.repeat(64), 'x-timestamp': String(Date.now() - 300_000), 'x-nonce': 'n-1' }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'request_expired' });
  });

  it('首次访问（无 cookie）引导下发 h5 token 并放行', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth2.1/protected' });

    expect(res.statusCode).toBe(200);
    expect(res.cookies.some(c => c.name === '_m_h5_tk')).toBe(true);
  });

  it('未声明 requireSignature 的公开路由不受校验影响', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth2.1/public', cookies: H5_COOKIE });
    expect(res.statusCode).toBe(200);
  });
});

describe('作用域外：不被中间件波及', () => {
  it('/user 下即使声明了 requireSignature 也保持原行为（其他前端无签名拦截器）', async () => {
    const res = await app.inject({ method: 'GET', url: '/user/protected', cookies: H5_COOKIE });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('/oauth2.10 是不同前缀，不放行也不拦截', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth2.10/protected', cookies: H5_COOKIE });
    expect(res.statusCode).toBe(200);
  });
});
