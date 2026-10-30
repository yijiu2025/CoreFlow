/**
 * 统一响应契约（真实装饰器驱动）
 *
 * 旧版本用 `const response = { code: 400, message: '参数错误' }` 这种手写常量自证，
 * 生产代码里的 `reply.result` 全部改坏也照样全绿。
 *
 * 本版注册**真实** `00-globals.js` 装饰器，用 Fastify inject 发真实请求，
 * 断言状态码 / code / message / data / requestId 的实际落点，以及分页计算。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';

import globalsLoader from '../framework/loader/registry/00-globals.js';

let app;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(globalsLoader);

  app.get('/success', (request, reply) => reply.result.success('获取成功', { id: 1 }));
  app.get('/created', (request, reply) => reply.result.created({ id: 2 }));
  app.get('/no-content', (request, reply) => reply.result.noContent());
  app.get('/bad-request', (request, reply) => reply.result.badRequest());
  app.get('/unauth', (request, reply) => reply.result.unauth());
  app.get('/forbidden', (request, reply) => reply.result.forbidden());
  app.get('/not-found', (request, reply) => reply.result.notFound());
  app.get('/conflict', (request, reply) => reply.result.conflict());
  app.get('/too-many', (request, reply) => reply.result.tooManyRequests());
  app.get('/internal', (request, reply) => reply.result.internalError());
  app.get('/fail-biz', (request, reply) => reply.result.fail('库存不足', { stock: 0 }, 400, 40001));
  app.get('/paginated', (request, reply) => reply.result.paginated([1, 2], 25, 2, 10));

  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

/** 统一封装：code/message/data/timestamp/requestId 五件套 */
function expectEnvelope(body, expectedCode) {
  expect(body).toMatchObject({ code: expectedCode });
  expect(typeof body.message).toBe('string');
  expect(body.message.length).toBeGreaterThan(0);
  expect(body).toHaveProperty('data');
  expect(typeof body.timestamp).toBe('number');
  expect(body).toHaveProperty('requestId');
}

describe('成功响应', () => {
  it('success → 200 + data 原样透传', async () => {
    const res = await app.inject({ method: 'GET', url: '/success' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expectEnvelope(body, 200);
    expect(body.message).toBe('获取成功');
    expect(body.data).toEqual({ id: 1 });
  });

  it('created → 201', async () => {
    const res = await app.inject({ method: 'GET', url: '/created' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ code: 201, data: { id: 2 } });
  });

  it('noContent → 204 且无响应体', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-content' });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });
});

describe('失败响应的状态码映射', () => {
  it.each([
    ['/bad-request', 400],
    ['/unauth', 401],
    ['/forbidden', 403],
    ['/not-found', 404],
    ['/conflict', 409],
    ['/too-many', 429],
    ['/internal', 500]
  ])('%s → HTTP %i，data 为 null', async (url, status) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(status);
    const body = res.json();
    expectEnvelope(body, status);
    expect(body.data).toBeNull();
  });

  it('fail 支持业务码：HTTP 400 但 body.code 为业务码', async () => {
    const res = await app.inject({ method: 'GET', url: '/fail-biz' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe(40001);
    expect(body.message).toBe('库存不足');
    expect(body.data).toEqual({ stock: 0 });
  });
});

describe('分页响应', () => {
  it('totalPages 向上取整，分页元信息独立于 data', async () => {
    const res = await app.inject({ method: 'GET', url: '/paginated' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expectEnvelope(body, 200);
    expect(body.data).toEqual([1, 2]);
    expect(body.pagination).toEqual({ total: 25, page: 2, pageSize: 10, totalPages: 3 });
  });
});
