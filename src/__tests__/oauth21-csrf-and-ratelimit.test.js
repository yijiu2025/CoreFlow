/**
 * oauth21 CSRF 与敏感接口限频（U21）
 *
 * 背景：这两套钩子历史上都注册在应用 `init` 里，而 `init` 运行在**封装子作用域**，
 * 覆盖不到 08-api 注册在根作用域的业务路由 —— 等于从未生效。同时：
 *   - CSRF 没有作用域闸门，且「没有 cookie 就放行」，攻击者构造的跨站表单恰好没有 cookie；
 *   - 排除清单把 `/oauth2.1/login`、`/authorize`、`/qr` 全排除，等于豁免了要保护的对象；
 *   - 限频按 `url.includes('/login')` 匹配，真接上去会误伤 `/user/v1/register` 等路径。
 *
 * 本测试加载**真实中间件**，断言：
 * - 非安全方法缺 token / 不匹配 → 403；带对 → 放行
 * - 安全方法负责签发 `_csrf`，引导端点可直接取 token
 * - 作用域只到 `/oauth2.1`：`/oauth2.10`、其他前端前缀不受影响
 * - 客户端凭据型端点（token/revoke）被排除
 * - 限频按**精确路径**生效，超阈值 429 且带 Retry-After，子路径/其他前缀不串用配额
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

const { createCsrfProtectionPlugin, CSRF_COOKIE, CSRF_HEADER } =
  await import('../app/oauth21/middleware/csrf.middleware.js');
const { sensitiveRateLimitPlugin, RATE_LIMIT_RULES } = await import('../app/oauth21/middleware/rate-limiter.js');
const { CSRF_EXCLUDE_PATHS } = await import('../app/oauth21/config/csrf-exclude.js');
const { buildRootPlugins } = await import('../app/oauth21/config.js');

let app;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(cookie);

  // 与 10-apps loader 一致：根作用域注册
  await app.register(sensitiveRateLimitPlugin);
  await app.register(createCsrfProtectionPlugin({ exclude: CSRF_EXCLUDE_PATHS }));

  // 目标路由：与真实业务同前缀，覆盖"被保护 / 被排除 / 作用域外 / 同前缀陷阱"四种
  app.post('/oauth2.1/login', async () => ({ ok: true }));
  app.post('/oauth2.1/login/consent/confirm', async () => ({ ok: true }));
  app.post('/oauth2.1/login/verify-email', async () => ({ ok: true }));
  app.post('/oauth2.1/token', async () => ({ ok: true }));
  app.post('/oauth2.1/revoke', async () => ({ ok: true }));
  app.post('/user/v1/register', async () => ({ ok: true }));
  app.post('/oauth2.10/login', async () => ({ ok: true }));
  app.get('/oauth2.1/anything', async () => ({ ok: true }));

  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

/** 取 Set-Cookie 里的 `_csrf` 值 */
function readCsrf(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  for (const raw of list) {
    const m = raw.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

describe('CSRF：签发与校验', () => {
  it('安全方法会下发 `_csrf`（前端第一次 GET 就能拿到，登录前不必额外往返）', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth2.1/anything' });
    expect(res.statusCode).toBe(200);
    expect(readCsrf(res.headers['set-cookie'])).toMatch(/^[0-9a-f]{48}$/);
  });

  it('引导端点返回同一枚 token 并铺好 cookie（且只下发一次）', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth2.1/csrf' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const setCookie = res.headers['set-cookie'];
    const list = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
    // 两枚同名 Set-Cookie 会让浏览器与响应体各自持有一份 token，属于隐蔽不一致
    expect(list.filter(raw => raw.includes(`${CSRF_COOKIE}=`))).toHaveLength(1);
    expect(body.data.token).toBe(readCsrf(setCookie));
  });

  it('cookie 与 header 一致 → 放行', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2.1/login',
      cookies: { [CSRF_COOKIE]: 'a'.repeat(48) },
      headers: { [CSRF_HEADER]: 'a'.repeat(48) }
    });
    expect(res.statusCode).toBe(200);
  });

  it('只有 cookie 没有 header → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2.1/login',
      cookies: { [CSRF_COOKIE]: 'b'.repeat(48) }
    });
    expect(res.statusCode).toBe(403);
  });

  it('🔴 没有 cookie 但带 header → 403（旧实现是"没 cookie 就放行"）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2.1/login',
      headers: { [CSRF_HEADER]: 'c'.repeat(48) }
    });
    expect(res.statusCode).toBe(403);
  });

  it('两者不一致 → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2.1/login',
      cookies: { [CSRF_COOKIE]: 'd'.repeat(48) },
      headers: { [CSRF_HEADER]: 'e'.repeat(48) }
    });
    expect(res.statusCode).toBe(403);
  });

  it('长度不同的 token 不会抛错（timingSafeEqual 前置守卫）→ 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2.1/login',
      cookies: { [CSRF_COOKIE]: 'short' },
      headers: { [CSRF_HEADER]: 'a'.repeat(48) }
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('CSRF：作用域与豁免', () => {
  it('作用域外的前缀完全不校验（其他前端不受影响）', async () => {
    for (const url of ['/user/v1/register', '/oauth2.10/login']) {
      const res = await app.inject({ method: 'POST', url });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 200 });
    }
  });

  it('客户端凭据型端点被排除（token / revoke 无 cookie 也能调）', async () => {
    for (const url of ['/oauth2.1/token', '/oauth2.1/revoke']) {
      const res = await app.inject({ method: 'POST', url });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 200 });
    }
  });

  it('登录子路径同样受保护（排除清单不能靠前缀把它们带出去）', async () => {
    const res = await app.inject({ method: 'POST', url: '/oauth2.1/login/consent/confirm' });
    expect(res.statusCode).toBe(403);
  });
});

describe('敏感接口限频：精确路径 + 429', () => {
  const loginRule = RATE_LIMIT_RULES.find(r => r.path === '/oauth2.1/login');

  it('规则表覆盖登录 / 二次验证 / 扫码确认 / 注册，且都带 /oauth2.1 前缀', () => {
    const paths = RATE_LIMIT_RULES.map(r => r.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/oauth2.1/login',
        '/oauth2.1/mini-login',
        '/oauth2.1/login/verify-email',
        '/oauth2.1/register'
      ])
    );
    for (const p of paths) expect(p.startsWith('/oauth2.1/')).toBe(true);
  });

  it(`同一 IP 连续登录超过 ${loginRule.maxRequests} 次 → 429 且带 Retry-After`, async () => {
    const ip = '10.9.9.1';
    const responses = [];
    for (let i = 0; i < loginRule.maxRequests + 1; i++) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/oauth2.1/login',
          remoteAddress: ip,
          cookies: { [CSRF_COOKIE]: 'f'.repeat(48) },
          headers: { [CSRF_HEADER]: 'f'.repeat(48) }
        })
      );
    }
    const statuses = responses.map(r => r.statusCode);
    // 前 N 次放行，第 N+1 次被限
    expect(statuses.slice(0, loginRule.maxRequests)).toEqual(Array(loginRule.maxRequests).fill(200));
    expect(statuses[loginRule.maxRequests]).toBe(429);
    expect(Number(responses[loginRule.maxRequests].headers['retry-after'])).toBeGreaterThan(0);
  });

  it('登录子路径用独立配额（不被 /oauth2.1/login 的额度拖黑）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2.1/login/verify-email',
      remoteAddress: '10.9.9.1',
      cookies: { [CSRF_COOKIE]: 'g'.repeat(48) },
      headers: { [CSRF_HEADER]: 'g'.repeat(48) }
    });
    expect(res.statusCode).toBe(200);
  });

  it('作用域外的同名字段不被限频（旧实现按子串匹配会误伤）', async () => {
    const ip = '10.9.9.1';
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: '/user/v1/register', remoteAddress: ip });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('应急开关 OAUTH21_SECURITY_HOOKS', () => {
  it('默认开启：限频 + CSRF + H5 签名三个插件', () => {
    expect(buildRootPlugins({})).toHaveLength(3);
  });

  it('置 off 时只保留 H5 签名（发布错序时的逃生门，不关签名）', () => {
    const plugins = buildRootPlugins({ OAUTH21_SECURITY_HOOKS: 'off' });
    expect(plugins).toHaveLength(1);
  });

  it('开关只认字面量 off，其他值（含空串）一律视为开启', () => {
    for (const value of [undefined, '', 'on', 'OFF', 'false']) {
      expect({ value, count: buildRootPlugins({ OAUTH21_SECURITY_HOOKS: value }).length }).toEqual({ value, count: 3 });
    }
  });
});
