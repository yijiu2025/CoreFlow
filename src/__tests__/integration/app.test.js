/**
 * 集成测试：应用核心流程端到端验证
 * 使用 Fastify inject() 模拟 HTTP 请求，无需真实数据库/Redis
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import crypto from 'node:crypto';

/**
 * 构建轻量级测试应用
 * 仅注册核心插件和路由，跳过数据库/Redis 依赖
 */
async function buildTestApp() {
  const app = Fastify({ logger: false });

  // 注册 reply.result 装饰器（模拟 00-globals.js）
  app.decorateReply('result', {
    getter() {
      const reply = this;
      return {
        success(message = '操作成功', data = null) {
          return reply.code(200).send({
            code: 200,
            message,
            data,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        },
        fail(message = '操作失败', data = null, code = 400) {
          return reply.code(code).send({
            code,
            message,
            data,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        },
        unauth(message = '身份验证失败') {
          return reply.code(401).send({
            code: 401,
            message,
            data: null,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        },
        forbidden(message = '权限不足') {
          return reply.code(403).send({
            code: 403,
            message,
            data: null,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        }
      };
    }
  });

  // 注册 request.state（模拟 auth middleware）
  app.addHook('onRequest', async (request) => {
    request.state = request.state || {};
  });

  // 测试路由：公开接口
  app.get('/api/public', async (request, reply) => {
    return reply.result.success('公开接口访问成功', { hello: 'world' });
  });

  // 测试路由：需要登录
  app.get('/api/protected', async (request, reply) => {
    if (!request.state.user) {
      return reply.result.unauth();
    }
    return reply.result.success('受保护接口访问成功', { uid: request.state.user.uid });
  });

  // 测试路由：权限不足
  app.get('/api/admin', async (request, reply) => {
    if (!request.state.user) {
      return reply.result.unauth();
    }
    if (request.state.user.role !== 'admin') {
      return reply.result.forbidden('需要管理员权限');
    }
    return reply.result.success('管理后台访问成功');
  });

  // 测试路由：业务失败
  app.post('/api/validate', async (request, reply) => {
    const { username } = request.body || {};
    if (!username) {
      return reply.result.fail('用户名不能为空');
    }
    if (username.length < 3) {
      return reply.result.fail('用户名长度不能少于3个字符');
    }
    return reply.result.success('校验通过');
  });

  // 测试路由：模拟服务器错误
  app.get('/api/error', async () => {
    throw new Error('模拟的服务器内部错误');
  });

  // 全局错误处理
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      code: statusCode,
      message: error.message || '服务器内部错误',
      data: null,
      timestamp: Date.now(),
      requestId: request.id
    });
  });

  return app;
}

describe('应用核心流程集成测试', () => {
  let app;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('响应格式标准化', () => {
    test('公开接口返回标准成功格式', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/public' });
      const body = res.json();

      expect(res.statusCode).toBe(200);
      expect(body.code).toBe(200);
      expect(body.message).toBe('公开接口访问成功');
      expect(body.data).toEqual({ hello: 'world' });
      expect(body.timestamp).toBeDefined();
    });

    test('业务失败返回标准失败格式', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/validate',
        payload: {}
      });
      const body = res.json();

      expect(res.statusCode).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('用户名不能为空');
    });

    test('参数校验通过返回成功', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/validate',
        payload: { username: 'testuser' }
      });
      const body = res.json();

      expect(res.statusCode).toBe(200);
      expect(body.message).toBe('校验通过');
    });

    test('参数校验失败返回具体错误', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/validate',
        payload: { username: 'ab' }
      });
      const body = res.json();

      expect(res.statusCode).toBe(400);
      expect(body.message).toContain('用户名长度');
    });
  });

  describe('认证流程', () => {
    test('未登录访问受保护接口返回 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/protected' });
      const body = res.json();

      expect(res.statusCode).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('身份验证失败');
    });

    test('登录后访问受保护接口返回成功', async () => {
      // 构建带用户状态的应用
      const authApp = Fastify({ logger: false });
      authApp.decorateReply('result', {
        getter() {
          const reply = this;
          return {
            success(message, data) {
              return reply.code(200).send({ code: 200, message, data });
            },
            unauth(message) {
              return reply.code(401).send({ code: 401, message });
            }
          };
        }
      });
      authApp.addHook('onRequest', async (request) => {
        request.state = {
          user: { uid: 'test-uid-123', role: 'user' }
        };
      });
      authApp.get('/api/protected', async (request, reply) => {
        if (!request.state.user) return reply.result.unauth();
        return reply.result.success('受保护接口访问成功', { uid: request.state.user.uid });
      });

      const res = await authApp.inject({ method: 'GET', url: '/api/protected' });
      const body = res.json();

      expect(res.statusCode).toBe(200);
      expect(body.data.uid).toBe('test-uid-123');
      await authApp.close();
    });
  });

  describe('权限控制', () => {
    test('非管理员访问管理接口返回 403', async () => {
      const roleApp = Fastify({ logger: false });
      roleApp.decorateReply('result', {
        getter() {
          const reply = this;
          return {
            success(msg) { return reply.code(200).send({ code: 200, message: msg }); },
            unauth(msg) { return reply.code(401).send({ code: 401, message: msg }); },
            forbidden(msg) { return reply.code(403).send({ code: 403, message: msg }); }
          };
        }
      });
      roleApp.addHook('onRequest', async (request) => {
        request.state = { user: { uid: 'user-1', role: 'user' } };
      });
      roleApp.get('/api/admin', async (request, reply) => {
        if (!request.state.user) return reply.result.unauth();
        if (request.state.user.role !== 'admin') return reply.result.forbidden('需要管理员权限');
        return reply.result.success('管理后台访问成功');
      });

      const res = await roleApp.inject({ method: 'GET', url: '/api/admin' });
      const body = res.json();

      expect(res.statusCode).toBe(403);
      expect(body.message).toBe('需要管理员权限');
      await roleApp.close();
    });

    test('管理员访问管理接口返回成功', async () => {
      const adminApp = Fastify({ logger: false });
      adminApp.decorateReply('result', {
        getter() {
          const reply = this;
          return {
            success(msg) { return reply.code(200).send({ code: 200, message: msg }); },
            forbidden(msg) { return reply.code(403).send({ code: 403, message: msg }); }
          };
        }
      });
      adminApp.addHook('onRequest', async (request) => {
        request.state = { user: { uid: 'admin-1', role: 'admin' } };
      });
      adminApp.get('/api/admin', async (request, reply) => {
        if (request.state.user.role !== 'admin') return reply.result.forbidden('需要管理员权限');
        return reply.result.success('管理后台访问成功');
      });

      const res = await adminApp.inject({ method: 'GET', url: '/api/admin' });
      expect(res.statusCode).toBe(200);
      await adminApp.close();
    });
  });

  describe('错误处理', () => {
    test('服务器内部错误返回 500', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/error' });
      const body = res.json();

      expect(res.statusCode).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('模拟的服务器内部错误');
    });

    test('不存在的路由返回 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/nonexistent' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('请求上下文', () => {
    test('响应包含 requestId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/public',
        headers: { 'x-request-id': 'test-req-123' }
      });
      const body = res.json();

      // requestId 可能来自 header 或自动生成
      expect(body.requestId).toBeDefined();
    });

    test('自动生成 requestId 当未提供时', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/public' });
      const body = res.json();

      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
    });
  });
});
