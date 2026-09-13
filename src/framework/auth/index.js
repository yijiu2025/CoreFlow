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
 * 文件结构（自上而下）：
 * 1. 依赖导入
 * 2. 常量与 ALS 上下文（jwtEnabled / DEBUG_AUTH / requestContext）
 * 3. ALS 上下文访问器（getCtx / getDb / getServerResource）
 * 4. JWT 解析（getUserFromToken）
 * 5. 认证与风险检测内部函数（authenticateByJwt / detectAndHandleRisk / injectRiskOnSend）
 * 6. 默认导出（Fastify 插件：onRequest/onSend 注册 + decorate）
 * 7. 命名导出
 *
 * @author yijiu
 * @since 2026-07-13
 * @since 2026-09-10 结构重排：onRequest 主流程拆函数；getCtx 改 err.code；reply.send 标记 sent；catch 补 warn
 */
import fp from 'fastify-plugin';
import { AsyncLocalStorage } from 'async_hooks';
import { getSession, getSessionTokenDevice } from './session.js';
import { COOKIE_SID, COOKIE_OPTIONS } from './cookie.js';
import { verify } from '../jwt/index.js';
import { findUserById } from '../../shared/user-dao.js';
import { loadUserPermissions } from './permission-loader.js';
import StpUtil from './StpUtil.js';
import { getDeviceId, computeDeviceFingerprint } from './device.js';
import { detectSessionRisk, isHighRiskRequest } from './anomaly-detector.js';
import { getStore } from '../redis/index.js';
import { createLogger, setLogContextProvider } from '../log/index.js';

const log = createLogger('framework.auth.index');

// ── 2. 常量与 ALS 上下文 ──

/** JWT 认证开关（从环境变量读取，避免依赖 oauth21 应用层） */
const jwtEnabled = process.env.JWT_ENABLED === 'true';

/**
 * 全局 AsyncLocalStorage 实例
 * 用于在 HTTP 请求生命周期内传递 request 对象，实现静态上下文穿透
 * @type {AsyncLocalStorage}
 */
const requestContext = new AsyncLocalStorage();

// ── 2.1 日志上下文注册（framework/log 不反向依赖 auth，避免循环） ──

setLogContextProvider(() => {
  const req = requestContext.getStore();
  if (!req) return {};
  return {
    requestId: req.id,
    userId: req.state?.user?.userId
  };
});

// ── 3. ALS 上下文访问器 ──

/**
 * 获取当前请求上下文
 * @returns {import('fastify').FastifyRequest}
 * @throws {Error} code=INTERNAL_CONTEXT_ERROR 当 ALS 无 store（非请求上下文内调用）
 */
function getCtx() {
  const req = requestContext.getStore();
  if (!req) {
    const err = new Error('认证上下文缺失：当前不在请求生命周期内（ALS 无 store）');
    err.code = 'INTERNAL_CONTEXT_ERROR';
    err.statusCode = 500;
    throw err;
  }
  return req;
}

/**
 * 获取数据库实例
 * @returns {object} Sequelize 实例
 */
function getDb() {
  const db = getCtx().server.db;
  if (!db) throw new Error('Database plugin not registered');
  return db;
}

/**
 * 通用服务器资源访问器
 * @param {string} name 插件名
 * @returns {*} 插件实例
 * @throws {Error} code=INVALID_PARAM 当 name 非字符串；未注册时抛普通 Error
 */
function getServerResource(name) {
  if (!name || typeof name !== 'string') {
    const err = new Error('name 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const resource = getCtx().server[name];
  if (resource === undefined) throw new Error(`Plugin "${name}" not registered`);
  return resource;
}

// ── 4. JWT 解析 ──

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
    log.debug('🔑 JWT 解析成功: sub=%s, aud=%s, token_type=%s', payload.sub, payload.aud, payload.token_type);

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
      log.warn('[Auth] 用户缓存读取失败，降级到数据库:', err);
    }

    if (!userData) {
      log.debug('📦 用户缓存未命中，查 DB: userId=%s', payload.sub);
      userData = await findUserById(payload.sub);
      if (!userData) return null;
      // 写入缓存（30 秒），账号禁用等状态变更 30s 内生效
      try {
        await userStore.set(String(payload.sub), userData, 30);
      } catch (err) {
        log.warn('[Auth] 用户缓存写入失败:', err);
      }
    } else {
      log.debug('📦 用户缓存命中: userId=%s, username=%s', userData.id, userData.username);
    }

    // 2. 检查账号状态（禁用则拒绝）
    if (userData.status === 0) {
      // warn：禁用账号的登录尝试是安全审计事件，生产环境需要可见
      log.warn('🚫 账号已禁用: userId=%s', userData.id);
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
        log.warn('[Auth] 缓存读取失败，降级到数据库:', err);
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
          log.warn('[Auth] 缓存写入失败:', err);
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
  } catch (err) {
    // JWT 解析全程异常（verify 失败 / findUserById 抛错 / loadUserPermissions 抛错）：
    // 返回 null 让调用方走"认证失败"分支，但记 warn 便于排障（原 catch {} 静默）
    log.warn('[Auth] getUserFromToken 异常:', err);
    return null;
  }
}

// ── 5. 认证与风险检测内部函数 ──

/**
 * JWT 认证（Bearer Token + access_token Cookie）
 *
 * @param {object} cookies 解析后的 cookies
 * @param {object} headers 请求头
 * @returns {Promise<object|null>} 认证成功的用户对象，或 null（未走 JWT / 失败）
 */
async function authenticateByJwt(cookies, headers) {
  if (!jwtEnabled) return null;
  log.debug('📋 JWT 模式已启用');

  // 2a. Bearer Token（Header）
  const authHeader = headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    log.debug('🔑 检测到 Bearer Token: %s...', token.slice(0, 20));
    const tokenUser = await getUserFromToken(token);
    if (tokenUser) {
      log.debug('✅ JWT 认证成功: userId=%s, username=%s', tokenUser.userId, tokenUser.username);
      return tokenUser;
    }
    // warn：认证失败是安全审计事件（爆破/伪造 token 探测），生产环境需要可见
    log.warn('❌ JWT 认证失败（Token 无效或用户不存在）');
  }

  // 2b. access_token Cookie
  if (cookies['access_token']) {
    const tokenUser = await getUserFromToken(cookies['access_token']);
    if (tokenUser) return tokenUser;
  }
  return null;
}

/**
 * 检测会话风险并按需拦截高风险写操作
 *
 * 基准从 Redis sessionData 取（登录时写入 deviceFingerprint + ip），不查 DB。
 * - warn（指纹/设备变更）+ 高风险写操作 → 403 拦截，返回验证信息让前端弹框
 * - info（IP 变/无基准）→ 不拦，记 request.state.risk 供响应体注入
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {object} sessionData 登录会话数据
 * @returns {Promise<void>}
 */
async function detectAndHandleRisk(request, reply, sessionData) {
  try {
    // 登录态恢复：客户端（header+cookie）无有效设备 ID 时，从登录链恢复身份
    // （Redis sessionData.deviceId 与风险基准指纹同源，优先；旧会话字段缺失才查 DB）。
    // 恢复/替换结果由下方"与客户端上报不一致 → 回写 X-Device-Id + Set-Cookie"收敛到前端
    const deviceId = await getDeviceId(request, {
      sessionDeviceId: sessionData.deviceId || '',
      sessionUserAgent: sessionData.userAgent || '',
      loadFromDb: () => getSessionTokenDevice(sessionData.sessionId)
    });
    // 设备 ID 与客户端上报不一致（旧格式 UUID / 无效 ID 被替换 / cookie 兜底恢复）→ 回写响应，
    // 前端 device-sync 读取 X-Device-Id 同步 localStorage，否则客户端永远发旧 ID，
    // 服务端每次换新随机 ID，指纹每请求都变，人机验证死循环。
    // X-Device-Id-Updated 为"服务端换发"显式信号（与 login.service 路径语义统一），
    // 前端收到后强制采纳，不依赖本地比对
    const clientDeviceId = request.headers['x-device-id'] || request.cookies?.device_id || '';
    if (deviceId && deviceId !== clientDeviceId) {
      reply.header('X-Device-Id', deviceId);
      reply.header('X-Device-Id-Updated', 'true');
      reply.setCookie('device_id', deviceId, COOKIE_OPTIONS.DEVICE);
    }
    const fingerprint = computeDeviceFingerprint({
      deviceId,
      userAgent: request.headers['user-agent'] || '',
      uid: sessionData.uid
    });
    const risk = await detectSessionRisk({
      userId: sessionData.userId,
      deviceId,
      ip: request.ip,
      fingerprint,
      baselineFingerprint: sessionData.deviceFingerprint, // 基准：登录时写入 Redis 的指纹
      baselineIp: sessionData.ip,
      // 设备 ID 丢失/变更：与指纹变更同级 warn，弹人机验证。
      // 丢失 = 客户端 header+cookie 均无 ID（含已被登录链恢复的情形，环境仍属异常）；
      // 变更 = 客户端上报 ID 与登录链身份不一致（无效被替换 / 恢复覆盖了新上报 ID）
      deviceIdMismatch: deviceId !== clientDeviceId,
      deviceIdMissing: !clientDeviceId
    });
    if (risk.level !== 'safe') {
      request.state.risk = risk;
      log.debug('⚠️ 会话风险: %s %j', risk.level, risk.reasons);

      // 高风险操作（非 GET）+ warn → 拦截，要求先完成人机验证
      // 豁免：带 x-verify-token 头的请求（用户正在调验证端点完成验证，不能拦自己）
      const isVerifying = !!request.headers['x-verify-token'];
      if (!isVerifying && risk.level === 'warn' && isHighRiskRequest(request) && risk.verify) {
        // 直接 reply.send 后必须标记 sent（守卫依赖 reply.sent 判断是否已发送响应）
        reply.code(403).send({
          code: 403,
          message: '检测到设备环境变更，请完成人机验证后再操作',
          data: null,
          __risk__: {
            level: risk.level,
            reasons: risk.reasons,
            verifyUrl: risk.verify.url,
            verifyHeader: risk.verify.header,
            verifyToken: risk.verify.token
          }
        });
        reply.sent = true;
        return;
      }
    }
  } catch (err) {
    // 风险检测失败不阻塞请求，但记 warn 便于排障（安全相关路径，原仅 _debug 生产不可见）
    log.warn('⚠️ [Auth] 会话风险检测异常:', err);
  }
}

/**
 * onSend 钩子：info 级风险（IP 变但指纹不变，可能是梯子）不拦请求，
 * 但响应体加 __risk__ 让前端弹验证框（不阻断读操作）；
 * warn+高风险已在 onRequest 拦截 403，此处只处理 GET 读操作的弹框提示。
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {*} payload 响应体
 * @returns {*} 处理后的 payload
 */
async function injectRiskOnSend(request, _reply, payload) {
  const risk = request.state?.risk;
  if (!risk || risk.level === 'safe' || !risk.verify) return payload;
  // warn 已在高风险操作拦截，若到了 onSend 说明是 GET 读操作，仍带验证信息让前端弹（不阻断）
  try {
    const body = typeof payload === 'string' ? JSON.parse(payload) : null;
    if (body && typeof body === 'object' && body.__risk__ === undefined) {
      body.__risk__ = {
        level: risk.level,
        reasons: risk.reasons,
        verifyUrl: risk.verify.url,
        verifyHeader: risk.verify.header,
        verifyToken: risk.verify.token
      };
      return JSON.stringify(body);
    }
  } catch {
    // 非 JSON 响应不改，原样返回
  }
  return payload;
}

// ── 6. 默认导出（Fastify 插件）──

const authPlugin = fp(async app => {
  // onRequest：认证主流程
  // 注意：认证钩子不依赖 ALS（用 request 参数直传），故先注册无碍。
  // ALS 钩子在后注册，其 requestContext.run 的 store 在 done() 后的异步延续里
  // 仍可供 preHandler/handler 阶段的 getCtx()/getDb()/getServerResource() 取用。
  app.addHook('onRequest', async (request, reply) => {
    // 1. 初始化 request.state
    if (!request.state) request.state = {};

    const cookies = request.cookies || {};
    log.debug('━━━ 请求认证开始 ━━━ url=%s, ip=%s', request.url, request.ip);
    log.debug('Cookie: sid=%s, sid_r=%s', cookies.sid ? '✅' : '❌', cookies.sid_r ? '✅' : '❌');

    // 2. JWT 认证（仅在 JWT_ENABLED=true 时启用）
    const jwtUser = await authenticateByJwt(cookies, request.headers);
    if (jwtUser) {
      request.state.user = jwtUser;
      return;
    }

    // 3. Session Cookie 验证（sid）— 主要认证方式
    let sessionData = null;

    // 尝试用 sid 获取 session（同时递增访问次数）
    if (cookies[COOKIE_SID]) {
      log.debug('📋 检测到 sid Cookie，尝试 Session 认证');
      sessionData = await getSession({ cookies, reply });
      log.debug('📋 Session 认证结果: %s', sessionData ? '✅ 成功' : '❌ 未命中');
    }

    // 写入 request.state.user + 风险检测
    if (sessionData) {
      log.debug('✅ 认证完成: userId=%s, username=%s', sessionData.userId, sessionData.username);
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

      // 访问时风险检测（基准从 Redis sessionData 取，不查 DB）
      await detectAndHandleRisk(request, reply, sessionData);
    }
  });

  // ALS 包裹每个请求
  app.addHook('onRequest', (request, reply, done) => {
    requestContext.run(request, () => {
      done();
    });
  });

  // onSend：info 级风险注入响应体（不阻断读操作）
  app.addHook('onSend', injectRiskOnSend);

  // 挂载 StpUtil 到 app
  app.decorate('auth', StpUtil);
});

// ── 7. 导出 ──

export default authPlugin;
export { requestContext, getCtx, getDb, getServerResource };
