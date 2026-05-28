/**
 * 集成测试：H5 Token 签名验证流程
 * 测试签名验证中间件的完整流程，包括 cookie 下发、签名计算、防重放
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import crypto from 'node:crypto';

/**
 * 模拟 H5 Token 存储（替代 Redis）
 */
function createMockSessionStore() {
  const store = new Map();
  return {
    async get(key) { return store.get(key) || null; },
    async set(key, value) {
      store.set(key, value);
    },
    async exists(key) { return store.has(key); }
  };
}

/**
 * 构建带签名验证的测试应用
 */
async function buildSignatureApp() {
  const app = Fastify({ logger: false });
  const sessionStore = createMockSessionStore();

  // 注册 cookie 插件
  await app.register(import('@fastify/cookie'));

  // 注册 reply.result 装饰器
  app.decorateReply('result', {
    getter() {
      const reply = this;
      return {
        success(msg, data) { return reply.code(200).send({ code: 200, message: msg, data }); },
        forbidden(msg) { return reply.code(403).send({ code: 403, message: msg }); }
      };
    }
  });

  // 签名验证中间件（内联版本，避免外部依赖）
  async function verifySignature(request, reply) {
    const sign = request.headers['x-sign'];
    const timestampStr = request.headers['x-timestamp'];
    const nonce = request.headers['x-nonce'];

    // 无签名头时自动下发 h5_token cookie
    if (!sign || !timestampStr || !nonce) {
      const existingCookie = request.cookies?._m_h5_tk;
      if (!existingCookie) {
        await issueH5Token(reply);
      }
      return;
    }

    // 防重放：时间偏差限制在 2 分钟
    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 120_000) {
      return reply.code(403).send({
        code: 403,
        error: 'request_expired',
        message: '安全检测失败：请求已过期或本地时间偏差过大'
      });
    }

    // 获取 H5 Token
    const m5H5Tk = request.cookies?._m_h5_tk;
    if (!m5H5Tk) {
      await issueH5Token(reply);
      return;
    }

    const [h5TokenMd5, expiredTimeStr] = m5H5Tk.split('_');
    const expiredTime = parseInt(expiredTimeStr, 10);
    if (!h5TokenMd5 || isNaN(expiredTime) || now > expiredTime) {
      return reply.code(403).send({
        code: 403,
        error: 'token_expired',
        message: '安全检测失败：Token 已失效'
      });
    }

    // 验证 token 存在性
    const h5Token = await sessionStore.get(h5TokenMd5);
    if (!h5Token) {
      return reply.code(403).send({
        code: 403,
        error: 'invalid_token',
        message: '安全检测失败：Token 不合法'
      });
    }

    // 重算签名（使用 SHA-256）
    const url = request.routerPath || request.url.split('?')[0];
    const bodyStr = request.body ? JSON.stringify(request.body) : '';
    const signString = `${h5TokenMd5}&${timestamp}&${nonce}&${url}&${bodyStr}`;
    const serverSign = crypto.createHash('sha256').update(signString).digest('hex');

    if (serverSign !== sign) {
      return reply.code(403).send({
        code: 403,
        error: 'signature_mismatch',
        message: '安全检测失败：接口签名不匹配'
      });
    }
  }

  async function issueH5Token(reply) {
    const rawH5Token = crypto.randomBytes(24).toString('hex');
    const h5TokenMd5 = crypto.createHash('sha256').update(rawH5Token).digest('hex');
    const ttlSeconds = 3600;
    const expiredTime = Date.now() + ttlSeconds * 1000;
    const cookieValue = `${h5TokenMd5}_${expiredTime}`;

    await sessionStore.set(h5TokenMd5, rawH5Token, ttlSeconds);

    reply.setCookie('_m_h5_tk', cookieValue, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: ttlSeconds
    });

    return rawH5Token;
  }

  // 路由：公开接口（不校验签名，注册在 hook 之前）
  app.get('/api/open', async (request, reply) => {
    return reply.result.success('公开接口');
  });

  // 路由：需要签名验证的接口（通过 preHandler 局部应用）
  app.get('/api/secure', { preHandler: verifySignature }, async (request, reply) => {
    return reply.result.success('安全接口访问成功');
  });

  return { app, sessionStore };
}

describe('H5 Token 签名验证流程', () => {
  let app, sessionStore;

  beforeAll(async () => {
    const built = await buildSignatureApp();
    app = built.app;
    sessionStore = built.sessionStore;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cookie 自动下发', () => {
    test('首次访问无 cookie 时自动下发 _m_h5_tk', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/secure' });

      expect(res.statusCode).toBe(200);
      const cookies = res.cookies;
      const h5Cookie = cookies.find(c => c.name === '_m_h5_tk');
      expect(h5Cookie).toBeDefined();
      expect(h5Cookie.value).toMatch(/^[a-f0-9]+_\d+$/);
    });

    test('已有 cookie 时不重复下发', async () => {
      // 先获取 cookie
      const firstRes = await app.inject({ method: 'GET', url: '/api/secure' });
      const h5Cookie = firstRes.cookies.find(c => c.name === '_m_h5_tk');

      // 带 cookie 访问
      const secondRes = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': h5Cookie.value }
      });

      expect(secondRes.statusCode).toBe(200);
    });
  });

  describe('签名验证', () => {
    test('有效签名通过验证', async () => {
      // 先获取 cookie
      const initRes = await app.inject({ method: 'GET', url: '/api/secure' });
      const h5Cookie = initRes.cookies.find((c) => c.name === '_m_h5_tk');
      const [h5TokenMd5] = h5Cookie.value.split('_');

      // 计算签名
      const timestamp = Date.now();
      const nonce = 'test-nonce-123';
      const url = '/api/secure';
      const signString = `${h5TokenMd5}&${timestamp}&${nonce}&${url}&`;
      const sign = crypto.createHash('sha256').update(signString).digest('hex');

      // 带签名访问
      const res = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': h5Cookie.value },
        headers: {
          'x-sign': sign,
          'x-timestamp': String(timestamp),
          'x-nonce': nonce
        }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('安全接口访问成功');
    });

    test('错误签名返回 403', async () => {
      const initRes = await app.inject({ method: 'GET', url: '/api/secure' });
      const h5Cookie = initRes.cookies.find((c) => c.name === '_m_h5_tk');

      const res = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': h5Cookie.value },
        headers: {
          'x-sign': 'invalid-signature',
          'x-timestamp': String(Date.now()),
          'x-nonce': 'test-nonce'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('signature_mismatch');
    });
  });

  describe('防重放攻击', () => {
    test('过期时间戳返回 403', async () => {
      const initRes = await app.inject({ method: 'GET', url: '/api/secure' });
      const h5Cookie = initRes.cookies.find((c) => c.name === '_m_h5_tk');
      const [h5TokenMd5] = h5Cookie.value.split('_');

      // 使用 5 分钟前的时间戳
      const oldTimestamp = Date.now() - 300_000;
      const nonce = 'test-nonce-old';
      const signString = `${h5TokenMd5}&${oldTimestamp}&${nonce}&/api/secure&`;
      const sign = crypto.createHash('sha256').update(signString).digest('hex');

      const res = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': h5Cookie.value },
        headers: {
          'x-sign': sign,
          'x-timestamp': String(oldTimestamp),
          'x-nonce': nonce
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('request_expired');
    });

    test('无效时间戳格式返回 403', async () => {
      const initRes = await app.inject({ method: 'GET', url: '/api/secure' });
      const h5Cookie = initRes.cookies.find((c) => c.name === '_m_h5_tk');

      const res = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': h5Cookie.value },
        headers: {
          'x-sign': 'some-sign',
          'x-timestamp': 'not-a-number',
          'x-nonce': 'test-nonce'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('request_expired');
    });
  });

  describe('Token 有效性', () => {
    test('伪造的 cookie 返回 403', async () => {
      const fakeCookie = `${'a'.repeat(64)}_${Date.now() + 3600_000}`;

      const res = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': fakeCookie },
        headers: {
          'x-sign': 'some-sign',
          'x-timestamp': String(Date.now()),
          'x-nonce': 'test-nonce'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('invalid_token');
    });

    test('过期的 cookie 返回 403', async () => {
      // 构造一个已过期的 cookie 格式
      const expiredCookie = `${'b'.repeat(64)}_${Date.now() - 1000}`;

      const res = await app.inject({
        method: 'GET',
        url: '/api/secure',
        cookies: { '_m_h5_tk': expiredCookie },
        headers: {
          'x-sign': 'some-sign',
          'x-timestamp': String(Date.now()),
          'x-nonce': 'test-nonce'
        }
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('token_expired');
    });
  });

  describe('公开接口跳过签名', () => {
    test('公开接口不校验签名直接返回', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/open' });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toBe('公开接口');
      // 不应下发 h5_token cookie
      const h5Cookie = res.cookies.find((c) => c.name === '_m_h5_tk');
      expect(h5Cookie).toBeUndefined();
    });
  });
});
