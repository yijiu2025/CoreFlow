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
 */

export default fp(async (app) => {
  // 核心增强：直接挂载便捷的链式响应方法到 reply 对象上
  // 使用 getter 模式可以确保内部的 this 始终指向当前的 reply 实例
  app.decorateReply('result', {
    getter() {
      const reply = this; // 当前请求的 reply 对象

      // 内部统一构建响应体，消除重复
      const build = (httpCode, message, data, bizCode) => ({
        code: bizCode ?? httpCode,
        message,
        data,
        timestamp: Date.now(),
        requestId: reply.request?.id
      });

      return {
        // 成功响应 (200)
        success(message = '操作成功', data = null) {
          return reply.code(200).send(build(200, message, data));
        },

        // 失败响应 (默认 400，支持业务错误码与 HTTP 状态码分离)
        fail(
          message = '操作失败',
          data = null,
          httpCode = 400,
          bizCode = null
        ) {
          return reply
            .code(httpCode)
            .send(build(httpCode, message, data, bizCode));
        },

        // 创建成功 (201)
        created(data = null, message = '创建成功') {
          return reply.code(201).send(build(201, message, data));
        },

        // 无内容 (204)
        noContent() {
          return reply.code(204).send();
        },

        // 认证失败 (401)
        unauth(message = '身份验证失败') {
          return reply.code(401).send(build(401, message, null));
        },

        // 权限不足 (403)
        forbidden(message = '权限不足') {
          return reply.code(403).send(build(403, message, null));
        },

        // 请求过于频繁 (429)
        tooManyRequests(message = '请求过于频繁，请稍后再试') {
          return reply.code(429).send(build(429, message, null));
        }
      };
    }
  });
});
