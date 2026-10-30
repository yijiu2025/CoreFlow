/**
 * `createQueue` 的 Redis 后端与 Map 后端**返回形态**必须一致
 *
 * 背景（2026-10-30，由 queue-atomic 关卡发现）：
 * Redis 后端的 `shift()` 直接把 Lua 的返回值交出去，而 `push()` 写进 Redis 的是
 * `JSON.stringify({ data, createdAt })` —— 于是 Redis 下 `msg.data` 恒为 `undefined`，
 * 消费方"收到了消息但内容全空"，且不报错。Map 后端存的是对象，`msg.data` 正常。
 *
 * 单测一直没发现：所有队列单测都跑默认的 map 后端，Redis 分支的形态没人比过
 * （关卡里也只表现为"只收到 0/300 条"，看着像丢消息）。
 *
 * 这里的判据是**形态一致性**而不是硬编码字段名：从 Map 后端真身取一条消息，
 * 用它自己的 key 集合去要求 Redis 后端 —— Map 那边加字段，这边自动跟上。
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

/** 假 store：把 `call(fn)` 里的裸客户端换成假的，其余方法够构造即可 */
const state = { evalReturn: null };

const fakeRedis = {
  async eval() {
    return state.evalReturn;
  }
};

const fakeStore = {
  call: fn => fn(fakeRedis),
  get: async () => null,
  set: async () => {},
  destroy: async () => {}
};

const SAVED_ENV = { REDIS_ENABLED: process.env.REDIS_ENABLED, REDIS_HOST: process.env.REDIS_HOST };

beforeAll(() => {
  // `createQueue(..., { backend: 'redis' })` 会先过 isRedisConfigured()，它只看环境变量
  process.env.REDIS_ENABLED = 'true';
  process.env.REDIS_HOST = '127.0.0.1';
});

afterAll(() => {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

jest.unstable_mockModule('../../../framework/redis/get-store.js', () => ({ getStore: () => fakeStore }));

const { createQueue } = await import('../../../framework/redis/queue-store.js');

beforeEach(() => {
  state.evalReturn = null;
});

describe('createQueue(backend: redis)：shift 与 Map 后端同形', () => {
  it('shift 返回解析后的消息对象，字段集合与 Map 后端一致', async () => {
    // Map 后端真身产出一条消息，用它自己的字段集合做判据
    const mapQueue = createQueue('parity-map', { maxSize: 10 });
    await mapQueue.push({ id: 1 });
    const mapMsg = await mapQueue.shift();

    // Redis 后端：Lua 返回的是 push 时写进去的那串 JSON
    state.evalReturn = JSON.stringify({ data: { id: 1 }, createdAt: mapMsg.createdAt });
    const redisQueue = createQueue('parity-redis', { backend: 'redis', maxSize: 10 });
    const redisMsg = await redisQueue.shift();

    expect(typeof redisMsg).toBe('object');
    expect(Object.keys(redisMsg).sort()).toEqual(Object.keys(mapMsg).sort());
    expect(redisMsg.data).toEqual({ id: 1 });
  });

  it('队列为空时返回 null（Lua 的 nil 不能被 JSON.parse 成字符串 "null"）', async () => {
    state.evalReturn = null;
    const queue = createQueue('empty-redis', { backend: 'redis', maxSize: 10 });

    await expect(queue.shift()).resolves.toBeNull();
  });

  it('内容不是合法 JSON 时原样返回（不吞数据、不抛错）', async () => {
    state.evalReturn = 'plain-text';
    const queue = createQueue('dirty-redis', { backend: 'redis', maxSize: 10 });

    await expect(queue.shift()).resolves.toBe('plain-text');
  });
});
