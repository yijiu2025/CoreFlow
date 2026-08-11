/**
 * 独立认证插件
 *
 * 不依赖任何业务模块，负责 Session/Token 认证与权限上下文传递。
 * 作为 Fastify onRequest 钩子注册，在每个请求开始时执行认证流程。
 *
 * 核心职责：
 * 1. ALS (AsyncLocalStorage) 上下文初始化，实现请求级别的上下文穿透
 * 2. Session Cookie 验证 → request.state.user（主要认证方式）
 * 3. Bearer Token / access_token Cookie 验证 → request.state.user（OAuth 2.1 兼容）
 * 4. sid 过期时用 sid_r 自动刷新（双令牌续期机制）
 *
 * 认证优先级：Bearer Token > access_token Cookie > Session Cookie (sid) > Refresh Token (sid_r)
 *
 * @author yijiu
 * @since 2026-07-13
 */
import fp from 'fastify-plugin';
import { AsyncLocalStorage } from 'async_hooks';
import { getSession, refreshSession } from './session.js';
import { COOKIE_SID, COOKIE_SID_R } from './cookie.js';
import { verifyJwt } from '../shared/jwt.js';
import { findUserById } from '../shared/user-dao.js';
import { loadUserPermissions } from './permission-loader.js';
import StpUtil from './StpUtil.js';

/** JWT 认证开关（从环境变量读取，避免依赖 oauth21 应用层） */
const jwtEnabled = process.env.JWT_ENABLED === 'true';

/**
 * 全局 AsyncLocalStorage 实例
 * 用于在 HTTP 请求生命周期内传递 request 对象，实现静态上下文穿透
 * @type {AsyncLocalStorage}
 */
const requestContext = new AsyncLocalStorage();

/**
 * 获取当前请求上下文
 * @returns {import('fastify').FastifyRequest}
 */
function getCtx() {
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
function getDb() {
  const db = getCtx().server.db;
  if (!db) throw new Error('Database plugin not registered');
  return db;
}

/**
 * 通用服务器资源访问器
 */
function getServerResource(name) {
  const resource = getCtx().server[name];
  if (resource === undefined) throw new Error(`Plugin "${name}" not registered`);
  return resource;
}

/**
 * 从 Bearer Token 解析用户信息
 *
 * 优先从 JWT Claims 读取 roles/permissions（新版 token 已嵌入），
 * 旧版 token 无 claims 时降级为 Redis 缓存 → 数据库查询。
 *
 * @param {string} token - JWT access_token
 * @param {object} redis - Redis 客户端（可选，用于权限缓存）
 * @returns {Promise<object|null} 用户信息对象或 null（验证失败时）
 */
async function getUserFromToken(token, redis) {
  try {
    const payload = verifyJwt(token);
    if (!payload?.sub) return null;

    const userData = await findUserById(payload.sub);
    if (!userData) return null;

    // 优先从 JWT 读取权限，无则从缓存/数据库加载
    let roles = payload.roles;
    let permissions = payload.permissions;
    if (!roles || !permissions) {
      // 尝试从 Redis 缓存读取（避免每次请求查库）
      const cacheKey = `perm:${userData.id}:${payload.client_id || 'GLOBAL'}`;
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            roles = roles || parsed.roles;
            permissions = permissions || parsed.permissions;
          }
        } catch {
          /* 缓存读写失败，降级到数据库 */
        }
      }

      // 缓存未命中，从数据库加载
      if (!roles || !permissions) {
        const loaded = await loadUserPermissions(userData.id, payload.client_id || 'GLOBAL');
        roles = roles || loaded.roles;
        permissions = permissions || loaded.permissions;

        // 写入缓存（5 分钟）
        if (redis) {
          try {
            await redis.set(cacheKey, JSON.stringify({ roles, permissions }), { EX: 300 });
          } catch {
            /* 缓存读写失败，降级到数据库 */
          }
        }
      }
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
  } catch {
    return null;
  }
}

export { requestContext, getCtx, getDb, getServerResource };

export default fp(async app => {
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
        const tokenUser = await getUserFromToken(token, request.server.redis);
        if (tokenUser) {
          request.state.user = tokenUser;
          return;
        }
      }

      // 2b. access_token Cookie
      if (cookies['access_token']) {
        const tokenUser = await getUserFromToken(cookies['access_token'], request.server.redis);
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
      sessionData = await refreshSession({ redis, cookies, reply, request });
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
  app.decorate('auth', StpUtil);
});
