/**
 * 独立认证插件
 * 不依赖任何业务模块，负责：
 * 1. ALS 上下文初始化
 * 2. Session Cookie 验证 → request.state.user
 * 3. 已登录用户自动续期
 * 4. sid 过期时用 sid_r 自动刷新
 */
import fp from 'fastify-plugin';
import { AsyncLocalStorage } from 'async_hooks';
import { getSession, refreshSession } from './session.js';
import { verifyCookie, COOKIE_SID, COOKIE_SID_R } from './cookie.js';

/** 全局 AsyncLocalStorage 实例 */
export const requestContext = new AsyncLocalStorage();

/**
 * 获取当前请求上下文
 * @returns {import('fastify').FastifyRequest}
 */
export function getCtx() {
  const req = requestContext.getStore();
  if (!req) {
    const err = new Error('INTERNAL_CONTEXT_ERROR');
    err.statusCode = 500;
    throw err;
  }
  return req;
}

/**
 * 获取数据库实例
 */
export function getDb() {
  const db = getCtx().server.db;
  if (!db) throw new Error('Database plugin not registered');
  return db;
}

/**
 * 通用服务器资源访问器
 */
export function getServerResource(name) {
  const resource = getCtx().server[name];
  if (resource === undefined)
    throw new Error(`Plugin "${name}" not registered`);
  return resource;
}

export default fp(async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    // 1. 初始化 request.state
    if (!request.state) request.state = {};

    // 2. Session 验证
    const redis = request.server.redis;
    const cookies = request.cookies || {};

    let sessionData = null;

    // 尝试用 sid 获取 session
    if (cookies[COOKIE_SID]) {
      sessionData = await getSession({ redis, cookies });
    }

    // sid 失效时尝试用 sid_r 刷新
    if (!sessionData && cookies[COOKIE_SID_R]) {
      sessionData = await refreshSession({ redis, cookies, reply });
    }

    // 写入 request.state.user
    if (sessionData) {
      request.state.user = {
        sub: sessionData.uid,
        uid: sessionData.uid,
        userId: sessionData.userId,
        username: sessionData.username,
        email: sessionData.email,
        avatar: sessionData.avatar,
        status: sessionData.status,
        appId: sessionData.appId,
        roles: sessionData.roles,
        permissions: sessionData.permissions,
        sessionId: sessionData.sessionId
      };
    }
  });

  // ALS 包裹每个请求
  app.addHook('onRequest', (request, reply, done) => {
    requestContext.run(request, () => {
      done();
    });
  });

  // 挂载 StpUtil 到 app
  const { default: StpUtil } = await import('./StpUtil.js');
  app.decorate('auth', StpUtil);
});
