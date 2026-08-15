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
import { getSession } from './session.js';
import { COOKIE_SID } from './cookie.js';
import { verify } from '../utils/jwt/verify.js';
import { findUserById } from '../shared/user-dao.js';
import { loadUserPermissions } from './permission-loader.js';
import StpUtil from './StpUtil.js';
import { getStore } from '../redis/index.js';

/* eslint-disable no-console */

/** JWT 认证开关（从环境变量读取，避免依赖 oauth21 应用层） */
const jwtEnabled = process.env.JWT_ENABLED === 'true';

/** 认证调试开关 */
const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';
function _debug(...args) {
  if (DEBUG_AUTH) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    console.log('[Auth Debug]', msg);
  }
}

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
 * 缓存通过 getStore 统一管理，自带超时保护、序列化和降级。
 *
 * @param {string} token - JWT access_token
 * @returns {Promise<object|null} 用户信息对象或 null（验证失败时）
 */
async function getUserFromToken(token) {
  try {
    const payload = await verify(token);
    if (!payload?.sub) return null;
    _debug('🔑 JWT 解析成功: sub=%s, aud=%s, token_type=%s', payload.sub, payload.aud, payload.token_type);

    // client_token：客户端凭证令牌（M2M），无用户上下文，直接返回客户端信息
    if (payload.token_type === 'client_token') {
      return {
        sub: payload.sub,
        userId: null,
        username: payload.sub,
        email: null,
        avatar: null,
        status: 1,
        roles: [],
        permissions: { allows: [], denies: [] },
        tokenType: 'client_token'
      };
    }

    // 1. 优先查用户缓存（30s TTL），避免每次请求打 DB
    //    缓存未命中才查库，兼顾性能与账号实时状态
    const userStore = getStore('user', { timeout: 3000 });
    let userData = null;
    try {
      userData = await userStore.get(String(payload.sub));
    } catch (err) {
      console.warn('[Auth] 用户缓存读取失败，降级到数据库:', err.message);
    }

    if (!userData) {
      _debug('📦 用户缓存未命中，查 DB: userId=%s', payload.sub);
      userData = await findUserById(payload.sub);
      if (!userData) return null;
      // 写入缓存（30 秒），账号禁用等状态变更 30s 内生效
      try {
        await userStore.set(String(payload.sub), userData, 30);
      } catch (err) {
        console.warn('[Auth] 用户缓存写入失败:', err.message);
      }
    } else {
      _debug('📦 用户缓存命中: userId=%s, username=%s', userData.id, userData.username);
    }

    // 2. 检查账号状态（禁用则拒绝）
    if (userData.status === 0) {
      _debug('🚫 账号已禁用: userId=%s', userData.id);
      return null;
    }

    // 3. 优先从 JWT 读取权限，无则从缓存/数据库加载
    let roles = payload.roles;
    let permissions = payload.permissions;
    if (!roles || !permissions) {
      const permStore = getStore('perm', { timeout: 3000 });
      const cacheKey = `${userData.id}:${payload.aud || 'GLOBAL'}`;

      try {
        const cached = await permStore.get(cacheKey);
        if (cached) {
          roles = roles || cached.roles;
          permissions = permissions || cached.permissions;
        }
      } catch (err) {
        console.warn('[Auth] 缓存读取失败，降级到数据库:', err.message);
      }

      // 缓存未命中，从数据库加载
      if (!roles || !permissions) {
        const loaded = await loadUserPermissions(userData.id, payload.aud || 'GLOBAL');
        roles = roles || loaded.roles;
        permissions = permissions || loaded.permissions;

        // 写入缓存（5 分钟），getStore 自带超时和序列化
        try {
          await permStore.set(cacheKey, { roles, permissions }, 300);
        } catch (err) {
          console.warn('[Auth] 缓存写入失败:', err.message);
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
      roles,
      permissions,
      tokenType: 'bearer'
    };
  } catch {
    return null;
  }
}

export default fp(async app => {
  app.addHook('onRequest', async (request, reply) => {
    // 1. 初始化 request.state
    if (!request.state) request.state = {};

    const cookies = request.cookies || {};
    _debug('━━━ 请求认证开始 ━━━ url=%s, ip=%s', request.url, request.ip);
    _debug('Cookie: sid=%s, sid_r=%s', cookies.sid ? '✅' : '❌', cookies.sid_r ? '✅' : '❌');

    // 2. JWT 认证（仅在 JWT_ENABLED=true 时启用）
    if (jwtEnabled) {
      _debug('📋 JWT 模式已启用');
      // 2a. Bearer Token（Header）
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        _debug('🔑 检测到 Bearer Token: %s...', token.slice(0, 20));
        const tokenUser = await getUserFromToken(token);
        if (tokenUser) {
          _debug('✅ JWT 认证成功: userId=%s, username=%s', tokenUser.userId, tokenUser.username);
          request.state.user = tokenUser;
          return;
        }
        _debug('❌ JWT 认证失败（Token 无效或用户不存在）');
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

    // 3. Session Cookie 验证（sid）— 主要认证方式
    let sessionData = null;

    // 尝试用 sid 获取 session（同时递增访问次数）
    if (cookies[COOKIE_SID]) {
      _debug('📋 检测到 sid Cookie，尝试 Session 认证');
      sessionData = await getSession({ cookies, reply });
      _debug('📋 Session 认证结果: %s', sessionData ? '✅ 成功' : '❌ 未命中');
    }

    // 写入 request.state.user
    if (sessionData) {
      _debug('✅ 认证完成: userId=%s, username=%s', sessionData.userId, sessionData.username);
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

export { requestContext, getCtx, getDb, getServerResource };
