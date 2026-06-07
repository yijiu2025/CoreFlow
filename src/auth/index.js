/**
 * 独立认证插件
 * 不依赖任何业务模块，负责：
 * 1. ALS 上下文初始化
 * 2. Session Cookie 验证 → request.state.user
 * 3. Bearer Token 验证 → request.state.user
 * 4. 已登录用户自动续期
 * 5. sid 过期时用 sid_r 自动刷新
 */
import fp from 'fastify-plugin';
import { AsyncLocalStorage } from 'async_hooks';
import { getSession, refreshSession } from './session.js';
import { COOKIE_SID, COOKIE_SID_R } from './cookie.js';

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

/**
 * 从 Bearer Token 解析用户信息
 * 优先从 JWT Claims 读取 roles/permissions（新版 token 已嵌入）
 * 旧版 token 无 claims 时降级为数据库查询
 */
async function getUserFromToken(token) {
  try {
    const { verify } = await import('../app/oauth21/crypto/jwt.js');
    const payload = verify(token);
    if (!payload?.sub) return null;

    // 查询用户详情
    const { default: UserDao } = await import('../app/oauth21/dao/user.dao.js');
    const userData = await UserDao.findById(payload.sub);
    if (!userData) return null;

    // 优先从 JWT 读取权限，无则从数据库加载
    let roles = payload.roles;
    let permissions = payload.permissions;
    if (!roles || !permissions) {
      const { loadUserPermissions } = await import('./permission-loader.js');
      const loaded = await loadUserPermissions(userData.id, payload.client_id || 'GLOBAL');
      roles = roles || loaded.roles;
      permissions = permissions || loaded.permissions;
    }

    return {
      sub: userData.id,
      uid: userData.id,
      userId: userData.id,
      username: userData.username,
      email: userData.email,
      avatar: userData.avatar,
      status: userData.status,
      scope: payload.scope,
      roles,
      permissions,
      tokenType: 'bearer'
    };
  } catch (err) {
    return null;
  }
}

export default fp(async (app) => {
  // 动态读取 JWT 配置
  const { default: config } = await import('../app/oauth21/config/config.js');
  const jwtEnabled = config.jwt.enabled;

  app.addHook('onRequest', async (request, reply) => {
    // 1. 初始化 request.state
    if (!request.state) request.state = {};

    const cookies = request.cookies || {};

    // 2. JWT 认证（仅在 JWT_ENABLED=true 时启用）
    if (jwtEnabled) {
      // 2a. Bearer Token（Header）
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const tokenUser = await getUserFromToken(token);
        if (tokenUser) {
          request.state.user = tokenUser;
          return;
        }
      }

      // 2b. access_token Cookie
      if (cookies['access_token']) {
        const tokenUser = await getUserFromToken(cookies['access_token']);
        if (tokenUser) {
          request.state.user = tokenUser;
          return;
        }
      }
    }

    // 3. Session Cookie 验证（sid / sid_r）— 主要认证方式
    const redis = request.server.redis;

    let sessionData = null;

    // 尝试用 sid 获取 session（同时递增访问次数）
    if (cookies[COOKIE_SID]) {
      sessionData = await getSession({ redis, cookies, reply });
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
