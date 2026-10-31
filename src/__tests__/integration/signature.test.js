/**
 * H5 请求签名（真实中间件驱动）
 *
 * ⚠️ 为什么重写：旧版本在测试文件里**内联复制**了一份 `verifySignature`（注释写着
 * "内联版本，避免外部依赖"），生产的 `src/framework/auth/signature.js` 从未被加载 ——
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
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-31 改为真身驱动（此前测的是内联副本，生产实现零覆盖）
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import { verifySignature } from '../../framework/auth/signature.js';
import { isRedisConfigured } from '../../framework/redis/utils.js';
import { connectTestRedis, disconnectTestRedis } from '../helpers/redis-connection.js';

const APP_KEY = 'test-sign-app-key';
/** 复原环境，避免污染同进程其他测试 */
const originalAppKey = process.env.SIGN_APP_KEY;

let app;

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

  app = Fastify({ logger: false });
  await app.register(cookie);

  // 真身中间件直接挂 preHandler —— 与 registerSecureRoute 写入 requireSignature 后的效果一致
  app.get('/secure', { preHandler: verifySignature, config: { requireSignature: true } }, async (_req, reply) =>
    reply.code(200).send({ ok: true })
  );

  // 未声明 requireSignature：应完全跳过
  app.get('/open', { preHandler: verifySignature }, async (_req, reply) => reply.code(200).send({ ok: true }));

  await app.ready();
});

afterAll(async () => {
  await app?.close();
  if (isRedisConfigured()) await disconnectTestRedis();
  if (originalAppKey === undefined) delete process.env.SIGN_APP_KEY;
  else process.env.SIGN_APP_KEY = originalAppKey;
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
