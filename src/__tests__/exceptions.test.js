import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
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

describe('全局错误处理器集成测试 (ApiException)', () => {
  let app;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // 模拟 app.js 里的错误处理逻辑
    app.setErrorHandler((error, request, reply) => {
      let statusCode = error.statusCode || error.status || 500;
      let bizCode = null;
      let message = error.message || '服务器内部错误';
      let data = null;

      if (error instanceof ApiException) {
        statusCode = error.statusCode;
        bizCode = error.bizCode;
        message = error.message;
        data = error.data;
      }

      reply.status(statusCode).send({
        code: bizCode ?? statusCode,
        message,
        data: data ?? null,
        timestamp: Date.now()
      });
    });

    // 注册测试路由
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

    app.get('/too-many-requests', async () => {
      throw new TooManyRequestsException();
    });

    app.get('/server-error', async () => {
      throw new InternalServerException();
    });

    app.get('/normal-error', async () => {
      throw new Error('普通异常消息');
    });
  });

  afterAll(async () => {
    await app.close();
  });

  test('BadRequestException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/bad-request' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe(20002);
    expect(body.message).toBe('无效的参数值');
    expect(body.data).toEqual({ field: 'email' });
  });

  test('UnauthorizedException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/unauthorized' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe(401);
    expect(body.message).toBe('身份验证失败');
  });

  test('ForbiddenException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/forbidden' });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe(403);
    expect(body.message).toBe('您没有操作权限');
  });

  test('NotFoundException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/not-found' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.code).toBe(404);
    expect(body.message).toBe('用户未找到');
  });

  test('ConflictException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/conflict' });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe(409);
    expect(body.message).toBe('资源冲突');
  });

  test('TooManyRequestsException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/too-many-requests' });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.code).toBe(429);
    expect(body.message).toBe('请求过于频繁，请稍后再试');
  });

  test('InternalServerException 响应格式', async () => {
    const res = await app.inject({ method: 'GET', url: '/server-error' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.code).toBe(500);
    expect(body.message).toBe('服务器内部错误');
  });

  test('普通 Error 响应格式向后兼容', async () => {
    const res = await app.inject({ method: 'GET', url: '/normal-error' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.code).toBe(500);
    expect(body.message).toBe('普通异常消息');
  });
});
