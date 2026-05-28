// src/loader/registry/00-globals.js
import fp from 'fastify-plugin';

export default fp(async (app) => {
  // 核心增强：直接挂载便捷的链式响应方法到 reply 对象上
  // 使用 getter 模式可以确保内部的 this 始终指向当前的 reply 实例
  app.decorateReply('result', {
    getter() {
      const reply = this; // 当前请求的 reply 对象

      return {
        // 成功响应
        success(message = '操作成功', data = null) {
          return reply.code(200).send({
            code: 200,
            message,
            data,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        },

        // 失败响应
        fail(message = '操作失败', data = null, code = 400) {
          return reply.code(code).send({
            code,
            message,
            data,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        },

        // 快捷认证失败
        unauth(message = '身份验证失败') {
          return reply.code(401).send({
            code: 401,
            message,
            data: null,
            timestamp: Date.now(),
            requestId: reply.request?.id
          });
        },

        // 快捷权限不足
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
});
