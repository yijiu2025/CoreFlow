/**
 * 统一 API 异常 + 全局错误处理器（真实实现驱动）
 *
 * ⚠️ 为什么重写：旧版本在 `beforeAll` 里**重写了一份** `setErrorHandler`
 * （注释写着"模拟 app.js 里的错误处理逻辑"），于是 `src/app.js` 里真正的
 * `createErrorHandler` 改坏也不会红 —— 而那段代码里恰好藏着一条安全属性：
 * **生产环境 500 不回显内部错误原文**（避免 SQL / 路径 / 内网地址外泄）。
 * 副本版本完全没有这条分支，等于把最该守的一条漏掉了。
 *
 * 现在直接驱动真身 `createErrorHandler(isProduction)`。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-31 错误处理器改为真身驱动（此前为内联副本）
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import Fastify from 'fastify';
import {
  ApiException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  TooManyRequestsException,
  InternalServerException
} from '../shared/exceptions.js';
// @fastify/static@10 依赖 **ESM-only** 的 content-disposition；Node 22.12+ 的 require(esm)
// 能跑通，但 jest 的 CJS 运行时不行 —— 于是任何 import src/app.js 的套件都会在加载阶段炸。
// 本文件只验证错误处理器（createErrorHandler），与静态资源无关，所以用空插件替身；
// 真实的静态服务链路由 CI 的 compose 冒烟（GET /v1/health/ready + 站点资源）覆盖。
jest.unstable_mockModule('@fastify/static', () => ({ default: async () => {} }));
const { createErrorHandler } = await import('../app.js');

describe('统一 API 异常基类', () => {
  test('ApiException 实例化及属性', () => {
    const err = new ApiException('测试异常', 400, 10001, { foo: 'bar' });
    expect(err.message).toBe('测试异常');
    expect(err.statusCode).toBe(400);
    expect(err.bizCode).toBe(10001);
    expect(err.data).toEqual({ foo: 'bar' });
    expect(err.name).toBe('ApiException');
  });

  test('快捷派生子类状态码正确性', () => {
    expect(new BadRequestException().statusCode).toBe(400);
    expect(new UnauthorizedException().statusCode).toBe(401);
    expect(new ForbiddenException().statusCode).toBe(403);
    expect(new NotFoundException().statusCode).toBe(404);
    expect(new ConflictException().statusCode).toBe(409);
    expect(new TooManyRequestsException().statusCode).toBe(429);
    expect(new InternalServerException().statusCode).toBe(500);
  });
});

/** 用真身 handler 建一个只跑路由的 app */
async function buildApp(isProduction) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(createErrorHandler(isProduction));

  app.get('/bad-request', async () => {
    throw new BadRequestException('无效的参数值', 20002, { field: 'email' });
  });
  app.get('/unauthorized', async () => {
    throw new UnauthorizedException();
  });
  app.get('/forbidden', async () => {
    throw new ForbiddenException('您没有操作权限');
  });
  app.get('/not-found', async () => {
    throw new NotFoundException('用户未找到');
  });
  app.get('/conflict', async () => {
    throw new ConflictException();
  });
  app.get('/too-many', async () => {
    throw new TooManyRequestsException();
  });
  app.get('/server-error', async () => {
    throw new InternalServerException();
  });
  app.get('/normal-error', async () => {
    throw new Error('普通异常消息');
  });
  // 用真实 schema 触发 AJV 校验失败（Fastify 会给 error 挂 validation 数组）
  app.post('/validated', { schema: { body: { type: 'object', required: ['name'] } } }, async () => ({ ok: true }));

  await app.ready();
  return app;
}

describe('全局错误处理器（真身 createErrorHandler）', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp(false); // 非生产：回显原文与 stack
  });

  afterAll(async () => {
    await app?.close();
  });

  test('BadRequestException：HTTP 400 + 业务码 + data', async () => {
    const res = await app.inject({ method: 'GET', url: '/bad-request' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe(20002);
    expect(body.message).toBe('无效的参数值');
    expect(body.data).toEqual({ field: 'email' });
  });

  test.each([
    ['/unauthorized', 401],
    ['/forbidden', 403],
    ['/not-found', 404],
    ['/conflict', 409],
    ['/too-many', 429],
    ['/server-error', 500]
  ])('%s → HTTP %i', async (url, status) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(status);
    expect(res.json().code).toBe(status);
  });

  test('统一响应含 timestamp / requestId / app', async () => {
    const res = await app.inject({ method: 'GET', url: '/not-found' });
    const body = res.json();
    expect(typeof body.timestamp).toBe('number');
    expect(body).toHaveProperty('requestId');
    expect(typeof body.app).toBe('string');
  });

  test('AJV 校验失败 → 400，并把校验信息拼进 message', async () => {
    const res = await app.inject({ method: 'POST', url: '/validated', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('name');
  });

  test('普通 Error → 500，非生产环境回显原文并带 stack', async () => {
    const res = await app.inject({ method: 'GET', url: '/normal-error' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.message).toBe('普通异常消息');
    expect(typeof body.stack).toBe('string');
  });
});

describe('生产环境：500 不得回显内部错误原文', () => {
  let prodApp;

  beforeAll(async () => {
    prodApp = await buildApp(true);
  });

  afterAll(async () => {
    await prodApp?.close();
  });

  test('🔴 普通 Error 的原文被替换成通用文案（防 SQL / 路径 / 内网地址外泄）', async () => {
    const res = await prodApp.inject({ method: 'GET', url: '/normal-error' });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.message).not.toBe('普通异常消息');
    expect(body.message).toContain('服务器内部错误');
  });

  test('生产环境不返回 stack', async () => {
    const res = await prodApp.inject({ method: 'GET', url: '/server-error' });
    expect(res.json().stack).toBeUndefined();
  });

  test('4xx 的业务提示仍然回显（生产只隐藏 5xx 细节，不牺牲可用性）', async () => {
    const res = await prodApp.inject({ method: 'GET', url: '/forbidden' });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe('您没有操作权限');
  });

  test('ApiException 携带的业务码在生产环境照常返回', async () => {
    const res = await prodApp.inject({ method: 'GET', url: '/bad-request' });
    expect(res.json().code).toBe(20002);
  });
});
