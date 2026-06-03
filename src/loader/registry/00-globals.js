// src/loader/registry/00-globals.js
import fp from 'fastify-plugin';

/**
 * @typedef {object} ReplyResult
 * @property {(message?: string, data?: any) => import('fastify').FastifyReply} success - 200 成功响应
 * @property {(message?: string, data?: any, httpCode?: number, bizCode?: number) => import('fastify').FastifyReply} fail - 失败响应
 * @property {(data?: any) => import('fastify').FastifyReply} created - 201 创建成功
 * @property {() => import('fastify').FastifyReply} noContent - 204 无内容
 * @property {(message?: string) => import('fastify').FastifyReply} unauth - 401 认证失败
 * @property {(message?: string) => import('fastify').FastifyReply} forbidden - 403 权限不足
 * @property {(message?: string) => import('fastify').FastifyReply} tooManyRequests - 429 请求过于频繁
 * @property {(data: any[], total: number, page: number, pageSize: number) => import('fastify').FastifyReply} paginated - 分页响应
 */

export default fp(async (app) => {
  app.decorateReply('result', {
    getter() {
      const reply = this;

      const build = (httpCode, message, data, bizCode) => ({
        code: bizCode ?? httpCode,
        message,
        data,
        timestamp: Date.now(),
        requestId: reply.request?.id
      });

      return {
        success(message = '操作成功', data = null) {
          return reply.code(200).send(build(200, message, data));
        },

        fail(message = '操作失败', data = null, httpCode = 400, bizCode = null) {
          return reply.code(httpCode).send(build(httpCode, message, data, bizCode));
        },

        created(data = null, message = '创建成功') {
          return reply.code(201).send(build(201, message, data));
        },

        noContent() {
          return reply.code(204).send();
        },

        unauth(message = '身份验证失败') {
          return reply.code(401).send(build(401, message, null));
        },

        forbidden(message = '权限不足') {
          return reply.code(403).send(build(403, message, null));
        },

        tooManyRequests(message = '请求过于频繁，请稍后再试') {
          return reply.code(429).send(build(429, message, null));
        },

        /**
         * 分页响应
         * @param {any[]} data 数据列表
         * @param {number} total 总条数
         * @param {number} page 当前页码
         * @param {number} pageSize 每页条数
         */
        paginated(data, total, page, pageSize) {
          return reply.code(200).send({
            code: 200,
            message: '获取成功',
            data,
            pagination: {
              total,
              page,
              pageSize,
              totalPages: Math.ceil(total / pageSize)
            },
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        }
      };
    }
  });
});
