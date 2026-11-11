/**
 * H5 请求签名（真实中间件驱动）
 *
 * ⚠️ 为什么重写：旧版本在测试文件里**内联复制**了一份 `verifySignature`（注释写着
 * "内联版本，避免外部依赖"），生产的 `src/framework/security/auth/security/signature.js` 从未被加载 ——
 * 那份副本甚至连 nonce 防重放、`SIGN_APP_KEY` 双因子、query 参与验签都没有，
 * 而这些恰恰是本仓修过的安全点。副本与真身早已分叉：副本「有 cookie 但不签名」直接放行，
 * 真身是 403。
 *
 * 现在直接注册**真身中间件**，断言的是线上真正执行的代码：
 *   1. 首次访问（无签名无 cookie）→ 下发 `_m_h5_tk` 并放行一次
 *   2. 已有 cookie 却不带签名 → 403 `signature_required`（不能靠"永远不带签名"绕过）
 *   3. 签名正确 → 200；签名错 → 403 `signature_mismatch`
 *   4. 时间戳越窗 → 403 `request_expired`
 *   5. cookie 不存在于存储 → 403 `invalid_token`；已过期 → 403 `token_expired`
 *   6. nonce 重放 → 403 `replay_detected`（真身有原子 check-and-mark，副本没有）
 *   7. query 参与验签：改一个参数 → 签名失效
 *   8. 未声明 requireSignature 的路由完全不受影响，也不下发 cookie
 *   9. 非 cookie 客户端：引导响应以 x-h5-tk 响应头下发 token，客户端凭同名请求头
 *      回传完成签名（与 cookie 同等约束：不签名 403、伪造 403）
 *  10. 引导放行仅限 GET/HEAD：写方法无 token → 403 token_required + 下发 token、
 *      handler 不执行；凭下发 token 签名重试 → 200（"永不上交 token"无法打写接口）
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-31 改为真身驱动（此前测的是内联副本，生产实现零覆盖）
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import { verifySignature } from '../../framework/security/auth/security/signature.js';
import { getStore } from '../../framework/persistence/redis/index.js';
import { isRedisConfigured } from '../../framework/persistence/redis/utils.js';
import { connectTestRedis, disconnectTestRedis } from '../helpers/redis-connection.js';

const APP_KEY = 'test-sign-app-key';
/** 复原环境，避免污染同进程其他测试 */
const originalAppKey = process.env.SIGN_APP_KEY;
const originalIssueMax = process.env.H5_ISSUE_MAX;

let app;
/** 未登录实例（无认证桩）：断言「未登录不签发、不落库」 */
let anonApp;

/** 按真身的拼接顺序算签名：md5 & appKey & timestamp & nonce & url & params & body */
function signFor({ md5, timestamp, nonce, url, params = '', body = '' }) {
  const signString = `${md5}&${APP_KEY}&${timestamp}&${nonce}&${url}&${params}&${body}`;
  return crypto.createHash('sha256').update(signString).digest('hex');
}

/** 从响应里取 _m_h5_tk 的 cookie 对象 */
const h5CookieOf = res => res.cookies.find(c => c.name === '_m_h5_tk');

/** 取一枚合法的 cookie 及其 md5 */
async function freshCookie() {
  const res = await app.inject({ method: 'GET', url: '/secure' });
  const h5 = h5CookieOf(res);
  return { cookie: h5.value, md5: h5.value.split('_')[0] };
}

beforeAll(async () => {
  // 真身中间件会 `getStore('h5_token')`：配了 Redis 却没人建连时，访问层按设计抛
  // RedisRequiredError(503)（fail-fast，不静默退回内存）。CI 里 REDIS_ENABLED=true
  // 但没有 Fastify 插件跑过 → 必须在这里显式建连，否则所有用例都收到 503。
  // 没配 Redis 时走进程内 MapStore，无需建连。
  if (isRedisConfigured()) await connectTestRedis();

  process.env.SIGN_APP_KEY = APP_KEY;
  // 本文件会在同一进程里连发十几个"新设备"，默认上限（20 次/分/IP）会把它判成刷子。
  // 限频本身由下面「签发限频」用例单独验证（它会把上限临时压到 1）。
  process.env.H5_ISSUE_MAX = '10000';

  app = Fastify({ logger: false });
  await app.register(cookie);

  // 已登录桩：真实链路由认证插件在 onRequest 写 `request.state.user`
  // （framework/security/auth/plugin.js:59/73），verifySignature 跑在 preHandler 读它。
  // 2026-11-10 起「未登录不签发」，因此签发类用例必须挂在已登录环境下 ——
  // 未登录行为由本文末尾的 anonApp 单独断言。
  app.addHook('onRequest', async request => {
    const uid = request.headers['x-test-uid'] || 'test-uid';
    request.state = { ...(request.state || {}), user: { uid, userId: 1 } };
  });

  // 真身中间件直接挂 preHandler —— 与 registerSecureRoute 写入 requireSignature 后的效果一致
  app.get('/secure', { preHandler: verifySignature, config: { requireSignature: true } }, async (_req, reply) =>
    reply.code(200).send({ ok: true })
  );

  // 写方法路由：引导放行收口（仅 GET/HEAD 放行）的断言对象
  app.post('/secure-post', { preHandler: verifySignature, config: { requireSignature: true } }, async (_req, reply) =>
    reply.code(200).send({ ok: true, posted: true })
  );

  // 未声明 requireSignature：应完全跳过
  app.get('/open', { preHandler: verifySignature }, async (_req, reply) => reply.code(200).send({ ok: true }));

  await app.ready();

  // 未登录实例：不装认证桩，用于断言「未登录不签发、不落库」
  anonApp = Fastify({ logger: false });
  await anonApp.register(cookie);
  anonApp.get('/secure', { preHandler: verifySignature, config: { requireSignature: true } }, async (_req, reply) =>
    reply.code(200).send({ ok: true })
  );
  anonApp.post(
    '/secure-post',
    { preHandler: verifySignature, config: { requireSignature: true } },
    async (_req, reply) => reply.code(200).send({ ok: true, posted: true })
  );
  await anonApp.ready();
});

afterAll(async () => {
  await app?.close();
  await anonApp?.close();
  if (isRedisConfigured()) await disconnectTestRedis();
  if (originalAppKey === undefined) delete process.env.SIGN_APP_KEY;
  else process.env.SIGN_APP_KEY = originalAppKey;
  if (originalIssueMax === undefined) delete process.env.H5_ISSUE_MAX;
  else process.env.H5_ISSUE_MAX = originalIssueMax;
});

describe('首次访问：引导下发 _m_h5_tk', () => {
  it('无签名且无 cookie → 放行一次并下发 cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/secure' });
    expect(res.statusCode).toBe(200);

    const h5 = h5CookieOf(res);
    expect(h5).toBeDefined();
    expect(h5.value).toMatch(/^[a-f0-9]{64}_\d+$/);
  });

  it('已有 cookie 但不带签名 → 403 signature_required（不能靠"永远不带签名"绕过）', async () => {
    const { cookie } = await freshCookie();

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: cookie }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('signature_required');
  });
});

describe('签名校验', () => {
  it('签名正确 → 200', async () => {
    const { cookie, md5 } = await freshCookie();
    const timestamp = Date.now();
    const nonce = `n-${crypto.randomUUID()}`;

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: cookie },
      headers: {
        'x-sign': signFor({ md5, timestamp, nonce, url: '/secure' }),
        'x-timestamp': String(timestamp),
        'x-nonce': nonce
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('签名错误 → 403 signature_mismatch', async () => {
    const { cookie } = await freshCookie();

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: cookie },
      headers: {
        'x-sign': 'a'.repeat(64),
        'x-timestamp': String(Date.now()),
        'x-nonce': `n-${crypto.randomUUID()}`
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('signature_mismatch');
  });

  it('签名不是合法 hex（长度不足）→ 403 而不是抛 RangeError（恒定时间比较的长度守卫）', async () => {
    const { cookie } = await freshCookie();

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: cookie },
      headers: {
        'x-sign': 'zzzz',
        'x-timestamp': String(Date.now()),
        'x-nonce': `n-${crypto.randomUUID()}`
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('signature_mismatch');
  });

  it('同名 nonce 第二次使用 → 403 replay_detected（重放防护真实生效）', async () => {
    const { cookie, md5 } = await freshCookie();
    const timestamp = Date.now();
    const nonce = `replay-${crypto.randomUUID()}`;
    const headers = {
      'x-sign': signFor({ md5, timestamp, nonce, url: '/secure' }),
      'x-timestamp': String(timestamp),
      'x-nonce': nonce
    };

    const first = await app.inject({ method: 'GET', url: '/secure', cookies: { _m_h5_tk: cookie }, headers });
    expect(first.statusCode).toBe(200);

    // 完全相同的请求重发：签名仍然"正确"，但 nonce 已用过
    const second = await app.inject({ method: 'GET', url: '/secure', cookies: { _m_h5_tk: cookie }, headers });
    expect(second.statusCode).toBe(403);
    expect(second.json().error).toBe('replay_detected');
  });

  it('query 参数参与验签：改一个参数值后原签名失效', async () => {
    const { cookie, md5 } = await freshCookie();
    const timestamp = Date.now();
    const params = 'a=1&b=2';

    const nonceOk = `q-${crypto.randomUUID()}`;
    const ok = await app.inject({
      method: 'GET',
      url: '/secure?a=1&b=2',
      cookies: { _m_h5_tk: cookie },
      headers: {
        'x-sign': signFor({ md5, timestamp, nonce: nonceOk, url: '/secure', params }),
        'x-timestamp': String(timestamp),
        'x-nonce': nonceOk
      }
    });
    expect(ok.statusCode).toBe(200);

    // 换一个 nonce（避开重放检测，把差异隔离到 query 上），
    // 但签名仍按「a=1&b=2」算 → 实际 query 是 b=3，必须失配
    const nonceBad = `q-${crypto.randomUUID()}`;
    const tampered = await app.inject({
      method: 'GET',
      url: '/secure?a=1&b=3',
      cookies: { _m_h5_tk: cookie },
      headers: {
        'x-sign': signFor({ md5, timestamp, nonce: nonceBad, url: '/secure', params }),
        'x-timestamp': String(timestamp),
        'x-nonce': nonceBad
      }
    });
    expect(tampered.statusCode).toBe(403);
    expect(tampered.json().error).toBe('signature_mismatch');
  });
});

describe('时间窗与 Token 状态', () => {
  it('时间戳越窗（5 分钟前）→ 403 request_expired', async () => {
    const { cookie, md5 } = await freshCookie();
    const oldTimestamp = Date.now() - 300_000;
    const nonce = `old-${crypto.randomUUID()}`;

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: cookie },
      headers: {
        'x-sign': signFor({ md5, timestamp: oldTimestamp, nonce, url: '/secure' }),
        'x-timestamp': String(oldTimestamp),
        'x-nonce': nonce
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('request_expired');
  });

  it('时间戳非数字 → 403 request_expired', async () => {
    const { cookie } = await freshCookie();

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: cookie },
      headers: { 'x-sign': 'a'.repeat(64), 'x-timestamp': 'not-a-number', 'x-nonce': 'n1' }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('request_expired');
  });

  it('cookie 里的 md5 不在存储中（伪造）→ 403 invalid_token', async () => {
    const fakeCookie = `${'a'.repeat(64)}_${Date.now() + 3_600_000}`;

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: fakeCookie },
      headers: { 'x-sign': 'a'.repeat(64), 'x-timestamp': String(Date.now()), 'x-nonce': 'n2' }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('invalid_token');
  });

  it('cookie 已过期 → 403 token_expired', async () => {
    const expiredCookie = `${'b'.repeat(64)}_${Date.now() - 1000}`;

    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      cookies: { _m_h5_tk: expiredCookie },
      headers: { 'x-sign': 'a'.repeat(64), 'x-timestamp': String(Date.now()), 'x-nonce': 'n3' }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('token_expired');
  });
});

describe('未声明 requireSignature 的路由', () => {
  it('直接放行，且不下发 h5 cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/open' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(h5CookieOf(res)).toBeUndefined();
  });
});

describe('非 cookie 客户端（x-h5-tk 头双通道）', () => {
  // 小程序 wx.request / 服务端 API 直连不便携带 cookie：
  // 引导响应同时以 x-h5-tk 响应头下发 token，客户端存储后以同名请求头回传。
  it('引导响应带 x-h5-tk 响应头；客户端凭该头完成签名请求', async () => {
    const bootstrap = await app.inject({ method: 'GET', url: '/secure' });
    expect(bootstrap.statusCode).toBe(200);

    const tk = bootstrap.headers['x-h5-tk'];
    expect(tk).toMatch(/^[a-f0-9]{64}_\d+$/);

    const md5 = tk.split('_')[0];
    const timestamp = Date.now();
    const nonce = `hdr-${crypto.randomUUID()}`;
    const signed = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: {
        'x-h5-tk': tk,
        'x-sign': signFor({ md5, timestamp, nonce, url: '/secure' }),
        'x-timestamp': String(timestamp),
        'x-nonce': nonce
      }
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json()).toEqual({ ok: true });
  });

  it('带 x-h5-tk 头但不签名 → 403 signature_required（与 cookie 同等约束）', async () => {
    const bootstrap = await app.inject({ method: 'GET', url: '/secure' });
    const tk = bootstrap.headers['x-h5-tk'];

    const res = await app.inject({ method: 'GET', url: '/secure', headers: { 'x-h5-tk': tk } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('signature_required');
  });

  it('header token 不在存储中（伪造）→ 403 invalid_token', async () => {
    const fake = `${'c'.repeat(64)}_${Date.now() + 3_600_000}`;
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: {
        'x-h5-tk': fake,
        'x-sign': 'a'.repeat(64),
        'x-timestamp': String(Date.now()),
        'x-nonce': 'hdr-fake'
      }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('invalid_token');
  });
});

describe('引导放行仅限 GET/HEAD（写方法防"永不上交 token"绕过）', () => {
  // 回归：修复前写方法（POST）无 token 也走"引导 + 放行"——攻击者每次丢弃 token
  // 即可免签名打写接口（引导绕过）。修复后写方法下发 token 但不执行 handler。
  it('POST 无签名无 token → 403 token_required + 下发 token，handler 未执行', async () => {
    const res = await app.inject({ method: 'POST', url: '/secure-post' });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('token_required');
    // token 已随本次响应下发（cookie + x-h5-tk 头），客户端可凭它签名重试
    expect(res.headers['x-h5-tk']).toMatch(/^[a-f0-9]{64}_\d+$/);
    expect(h5CookieOf(res)).toBeDefined();
  });

  it('POST 带签名参数但无 token → 403 token_required（假签名头换不来执行权）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/secure-post',
      headers: {
        'x-sign': 'a'.repeat(64),
        'x-timestamp': String(Date.now()),
        'x-nonce': `bypass-${crypto.randomUUID()}`
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('token_required');
    expect(res.json()).not.toEqual({ ok: true, posted: true });
  });

  it('POST：凭 403 响应下发的 token 签名重试 → 200（引导-重试闭环）', async () => {
    const first = await app.inject({ method: 'POST', url: '/secure-post' });
    const tk = first.headers['x-h5-tk'];
    const md5 = tk.split('_')[0];

    const timestamp = Date.now();
    const nonce = `retry-${crypto.randomUUID()}`;
    const retry = await app.inject({
      method: 'POST',
      url: '/secure-post',
      headers: {
        'x-h5-tk': tk,
        'x-sign': signFor({ md5, timestamp, nonce, url: '/secure-post', body: '{"a":1}' }),
        'x-timestamp': String(timestamp),
        'x-nonce': nonce
      },
      payload: { a: 1 }
    });

    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({ ok: true, posted: true });
  });

  it('GET 带签名参数但无 token（cookie 过期场景）→ 仍引导放行（浏览器首访兼容）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: {
        'x-sign': 'a'.repeat(64),
        'x-timestamp': String(Date.now()),
        'x-nonce': `expired-${crypto.randomUUID()}`
      }
    });

    expect(res.statusCode).toBe(200);
    expect(h5CookieOf(res)).toBeDefined();
  });
});

describe('未登录：不签发、不落库（2026-11-10）', () => {
  it('GET 无 token → 200 放行，但不下发 cookie / 响应头', async () => {
    const res = await anonApp.inject({ method: 'GET', url: '/secure' });

    expect(res.statusCode).toBe(200);
    expect(h5CookieOf(res)).toBeUndefined();
    expect(res.headers['x-h5-tk']).toBeUndefined();
  });

  it('未登录请求不产生 h5_token 键（命名空间条目数不变）', async () => {
    // 这条是本次改造的核心断言：修复前每次匿名引导都会写一个 1h TTL 的键
    const store = getStore('h5_token');
    const before = await store.size();

    for (let i = 0; i < 5; i++) {
      await anonApp.inject({ method: 'GET', url: '/secure' });
    }

    expect(await store.size()).toBe(before);
  });

  it('写方法无 token → 403 login_required（不是 token_required，避免"拿 token 重试"死循环）', async () => {
    const res = await anonApp.inject({ method: 'POST', url: '/secure-post' });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('login_required');
    expect(h5CookieOf(res)).toBeUndefined();
    expect(res.headers['x-h5-tk']).toBeUndefined();
  });

  it('未登录带假签名头 → 403 login_required，handler 不执行', async () => {
    const res = await anonApp.inject({
      method: 'POST',
      url: '/secure-post',
      headers: {
        'x-sign': 'a'.repeat(64),
        'x-timestamp': String(Date.now()),
        'x-nonce': `anon-${crypto.randomUUID()}`
      }
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('login_required');
    expect(res.json()).not.toEqual({ ok: true, posted: true });
  });
});

describe('设备维度幂等（键数 = 客户端数，不是签发次数）', () => {
  it('同一 x-device-id 两次引导 → 复用同一个 token，且不新增键', async () => {
    const store = getStore('h5_token');
    const deviceId = `dev-${crypto.randomUUID()}`;

    const first = await app.inject({ method: 'GET', url: '/secure', headers: { 'x-device-id': deviceId } });
    const md5a = h5CookieOf(first).value.split('_')[0];

    const before = await store.size();
    const second = await app.inject({ method: 'GET', url: '/secure', headers: { 'x-device-id': deviceId } });
    const md5b = h5CookieOf(second).value.split('_')[0];

    expect(md5b).toBe(md5a);
    expect(await store.size()).toBe(before);
  });

  it('不同 x-device-id → 不同 token', async () => {
    const a = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-device-id': `dev-a-${crypto.randomUUID()}` }
    });
    const b = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-device-id': `dev-b-${crypto.randomUUID()}` }
    });

    expect(h5CookieOf(a).value.split('_')[0]).not.toBe(h5CookieOf(b).value.split('_')[0]);
  });

  it('值不再是裸 rawToken，而是带归属的元数据对象', async () => {
    const deviceId = `dev-${crypto.randomUUID()}`;
    const res = await app.inject({ method: 'GET', url: '/secure', headers: { 'x-device-id': deviceId } });
    const md5 = h5CookieOf(res).value.split('_')[0];

    const value = await getStore('h5_token').get(md5);

    expect(typeof value).toBe('object');
    expect(value).toMatchObject({ v: 1, u: 'test-uid' });
    // 旧实现存的是 48 字符 hex（rawToken），验签根本不用它
    expect(value).not.toBeInstanceOf(String);
  });

  it('同一设备换账号 → 换新 token（归属字段不能指向上一个用户）', async () => {
    const deviceId = `dev-${crypto.randomUUID()}`;

    const first = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-device-id': deviceId, 'x-test-uid': 'user-a' }
    });
    const md5a = h5CookieOf(first).value.split('_')[0];

    const second = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-device-id': deviceId, 'x-test-uid': 'user-b' }
    });
    const md5b = h5CookieOf(second).value.split('_')[0];

    expect(md5b).not.toBe(md5a);
    expect(await getStore('h5_token').get(md5a)).toBeNull();
    expect(await getStore('h5_token').get(md5b)).toMatchObject({ u: 'user-b' });
  });
});

describe('签发限频（每 IP 每分钟上限）', () => {
  it('超过 H5_ISSUE_MAX 后不再签发：GET 仍放行，但不再下发 token', async () => {
    const prev = process.env.H5_ISSUE_MAX;
    process.env.H5_ISSUE_MAX = '1';
    try {
      // 清掉本文件前面累加的计数，让这条用例与执行顺序无关
      await getStore('h5_issue').clear();

      const first = await app.inject({
        method: 'GET',
        url: '/secure',
        headers: { 'x-device-id': `rl-a-${crypto.randomUUID()}` }
      });
      expect(h5CookieOf(first)).toBeDefined();

      const second = await app.inject({
        method: 'GET',
        url: '/secure',
        headers: { 'x-device-id': `rl-b-${crypto.randomUUID()}` }
      });
      expect(second.statusCode).toBe(200);
      expect(h5CookieOf(second)).toBeUndefined();
      expect(second.headers['x-h5-tk']).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.H5_ISSUE_MAX;
      else process.env.H5_ISSUE_MAX = prev;
      await getStore('h5_issue').clear();
    }
  });
});
