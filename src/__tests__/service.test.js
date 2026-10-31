/**
 * 登录请求解析服务（真实模块驱动）
 *
 * ⚠️ 为什么重写：旧版本全部是「`const params = {...}` → 断言 `params.client_id` 有值」，
 * 一个生产模块都没加载 —— 把 `src/app/oauth21/services/` 整个删掉它也全绿。它能通过
 * test-effectiveness 守卫只是因为末尾有一句 `await import('crypto')`。
 *
 * 现在驱动真身 `decryptLoginRequest`。这一层是登录链路的**第一道闸**，四条分支都属于
 * 安全语义而非业务细节：
 *   - 时间戳越窗 → 拒绝（否则密文可被无限重放）
 *   - nonce 缺失/重复 → 拒绝（原子 check-and-mark，并发下也不会有窗口）
 *   - 明文传密码 → 拒绝（强制 RSA 加密传输，避免口令进日志/网关）
 *   - 解密失败/JSON 非法 → 400 而不是抛给 Fastify（否则变成 500 + 栈泄露）
 *
 * 依赖替换说明：只把 `framework/keys/encryption.js` 的 `decrypt` 换成可控替身，
 * `validateTimestamp` 用显式开关控制返回值（不复制它的时间窗逻辑 ——
 * 时间窗本身由 `keys-envelope.test.js` 对真身单独覆盖）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-31 改为真身驱动（此前为纯常量自证，生产代码零覆盖）
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, jest } from '@jest/globals';
import crypto from 'node:crypto';
import { isRedisConfigured } from '../framework/redis/utils.js';
import { connectTestRedis, disconnectTestRedis } from './helpers/redis-connection.js';

/** 由用例驱动的替身状态 */
const fake = {
  timestampOk: true,
  decryptImpl: async () => '{}'
};

jest.unstable_mockModule('../framework/keys/encryption.js', () => ({
  validateTimestamp: () => fake.timestampOk,
  decrypt: (...args) => fake.decryptImpl(...args)
}));

const { decryptLoginRequest, verifyEmailCode } = await import('../app/oauth21/services/decrypt.service.js');

/** 构造一个最小 request：只会被读 body / ip / headers */
const makeRequest = (body = {}, headers = {}) => ({ body, ip: '203.0.113.9', headers });

/** 每次用不同 nonce，避免用例间互相干扰（真身 nonce 是全局存储） */
const uniqueNonce = () => `nonce-${crypto.randomUUID()}`;

/** 一个必然通过格式检查的 RSA 密文占位（decrypt 已被替身接管） */
const ENCRYPTED = 'ZmFrZS1jaXBoZXJ0ZXh0';

beforeEach(() => {
  fake.timestampOk = true;
  fake.decryptImpl = async () => '{}';
});

// 真身的 nonce 去重走 `createNonceStore()` → Redis（或未配置时的进程内实现）。
// 配了 Redis 而没人建连时访问层按设计抛 RedisRequiredError(503)，CI 里就是这样；
// 因此这里显式建连（本地未配置 Redis 时无需建连，自动走内存实现）。
beforeAll(async () => {
  if (isRedisConfigured()) await connectTestRedis();
});

afterAll(async () => {
  if (isRedisConfigured()) await disconnectTestRedis();
});

describe('decryptLoginRequest · RSA 分支的三道闸', () => {
  it('时间戳越窗 → 400「请求时间戳异常」', async () => {
    fake.timestampOk = false;

    const r = await decryptLoginRequest(makeRequest({ encrypted: ENCRYPTED, timestamp: 1, nonce: uniqueNonce() }));

    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toContain('时间戳');
  });

  it('缺 nonce → 400 重放检测（不能跳过防重放）', async () => {
    const r = await decryptLoginRequest(makeRequest({ encrypted: ENCRYPTED, timestamp: Date.now() }));

    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toContain('nonce');
  });

  it('同一 nonce 第二次使用 → 400（真身是原子 check-and-mark，不是 get+set）', async () => {
    const nonce = uniqueNonce();
    const body = { encrypted: ENCRYPTED, timestamp: Date.now(), nonce };

    const first = await decryptLoginRequest(makeRequest(body));
    expect(first.success).toBe(true);

    const second = await decryptLoginRequest(makeRequest(body));
    expect(second.success).toBe(false);
    expect(second.error).toContain('nonce');
  });

  it('解密成功 → 字段映射完整，keepLogin 默认 true', async () => {
    fake.decryptImpl = async () =>
      JSON.stringify({ username: 'alice', password: 'pw', type: 'password', email: null, code: null });

    const r = await decryptLoginRequest(
      makeRequest({ encrypted: ENCRYPTED, timestamp: Date.now(), nonce: uniqueNonce(), oidcNonce: 'o-1' })
    );

    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ username: 'alice', password: 'pw', type: 'password', oidcNonce: 'o-1' });
    expect(r.data.keepLogin).toBe(true);
  });

  it('显式 keepLogin:false 必须被保留（否则"不记住我"会退化成 30 天会话）', async () => {
    fake.decryptImpl = async () => JSON.stringify({ username: 'bob', password: 'pw', keepLogin: false });

    const r = await decryptLoginRequest(
      makeRequest({ encrypted: ENCRYPTED, timestamp: Date.now(), nonce: uniqueNonce() })
    );

    expect(r.data.keepLogin).toBe(false);
  });

  it('解密抛错 → 400 且不向上抛（避免 500 + 栈泄露）', async () => {
    fake.decryptImpl = async () => {
      throw new Error('bad padding');
    };

    const r = await decryptLoginRequest(
      makeRequest({ encrypted: ENCRYPTED, timestamp: Date.now(), nonce: uniqueNonce() })
    );

    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toContain('解密失败');
  });

  it('解出的不是合法 JSON → 同样 400 而不是抛异常', async () => {
    fake.decryptImpl = async () => 'not-json{';

    const r = await decryptLoginRequest(
      makeRequest({ encrypted: ENCRYPTED, timestamp: Date.now(), nonce: uniqueNonce() })
    );

    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
  });
});

describe('decryptLoginRequest · 邮箱验证码分支', () => {
  it('type=email 缺 code → 400', async () => {
    const r = await decryptLoginRequest(makeRequest({ type: 'email', email: 'a@b.com' }));
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toContain('邮箱和验证码不能为空');
  });

  it('type=email 参数齐全 → 直接放行给后续校验（此层不做验证码比对）', async () => {
    const r = await decryptLoginRequest(makeRequest({ type: 'email', email: 'a@b.com', code: '123456' }));
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ type: 'email', email: 'a@b.com', code: '123456' });
  });
});

describe('decryptLoginRequest · 必须强制加密', () => {
  it('明文传 password → 400「必须使用 RSA 加密传输」', async () => {
    const r = await decryptLoginRequest(makeRequest({ username: 'alice', password: 'plain-password' }));
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toContain('RSA 加密');
  });

  it('只传 username 也拒绝', async () => {
    const r = await decryptLoginRequest(makeRequest({ username: 'alice' }));
    expect(r.success).toBe(false);
    expect(r.error).toContain('RSA 加密');
  });

  it('空 body → 400 无效的登录请求', async () => {
    const r = await decryptLoginRequest(makeRequest({}));
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(400);
    expect(r.error).toContain('无效');
  });
});

describe('verifyEmailCode（真实 emailDao + 内存 store）', () => {
  it('库里没有该邮箱的验证码 → success:false 且给出可读错误', async () => {
    const r = await verifyEmailCode('nobody@example.com', '123456', makeRequest({}));
    expect(r.success).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error.length).toBeGreaterThan(0);
  });
});
