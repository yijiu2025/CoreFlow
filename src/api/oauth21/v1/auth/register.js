/**
 * 注册模块
 *
 * POST /mini-register — 快捷注册
 */

import { registerSecureRoute } from '../../../guard.js';

/**
 * 注册注册路由
 */
export default function registerRegisterRoutes(fastify) {
  // POST /mini-register — 快捷注册
  registerSecureRoute(fastify, {
    name: 'miniRegister',
    alias: '快捷注册',
    method: 'POST',
    url: '/mini-register',
    handler: async (request, reply) => {
      // 转发至 SSO 注册逻辑
      return reply.code(201).send({
        code: 201,
        message: '快捷注册功能暂由 SSO 注册接口统一处理',
        data: null
      });
    }
  });
}
