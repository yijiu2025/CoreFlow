/**
 * 企业级三级安全编排引擎 (Next-Gen Security Engine)
 * 支持：System (层) -> Group (文件) -> API (接口) 的级联校验与动态热更新
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

// =============================================================================
// 1. 导入
// =============================================================================

import {
  getGuardConfig,
  registerApiMetadata,
  registerSystemMetadata,
  registerGroupMetadata as rawRegisterGroupMetadata
} from './guard-config.js';
import { isIpMatch } from '../utils/ip.js';
import { getPermissions } from '../framework/auth/perm-cache.js';
import { createLogger } from '../framework/log/index.js';

const log = createLogger('api.guard');

// =============================================================================
// 2. 模块级状态
// =============================================================================

/** 当前注册上下文（由 Loader 自动维护） */
let currentSystem = 'system-default';
let currentGroup = '';
let currentPrefix = '';

/** 路由注册表：method+fullUrl → { group, name }。用于实时检测重复注册 */
const _routeRegistry = new Map();

// =============================================================================
// 3. 内部工具函数
// =============================================================================

/**
 * 辅助函数：安全拼接 URL
 */
function joinUrl(...parts) {
  return parts
    .map(part => part.replace(/(^\/+|\/+$)/g, '')) // 去掉两端斜杠
    .filter(part => part.length > 0)
    .join('/');
}

/**
 * 权限通配符匹配
 * @param {string} pattern - 权限模式，如 'user:page:read' 或 'user:page:*'
 * @param {string} target - 用户实际拥有的权限
 * @returns {boolean}
 */
function isPermissionMatch(pattern, target) {
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (pattern.endsWith(':*')) {
    return target.startsWith(pattern.slice(0, -1));
  }
  return false;
}

/**
 * 检查用户是否匹配单个权限
 */
function matchSingle(perm, allows, denies) {
  if (denies.some(d => isPermissionMatch(d, perm))) return false;
  return allows.some(a => isPermissionMatch(a, perm));
}

/**
 * 检查用户是否拥有指定权限
 * 支持三种格式：
 * - 'user:page:read'           → 单个权限
 * - { any: ['a', 'b'] }       → 任一满足（OR）
 * - { all: ['a', 'b'] }       → 全部满足（AND）
 * @param {string|object} required
 * @param {object} user - 含 permissions.allows/denies
 * @returns {boolean}
 */
function checkPermission(required, user) {
  if (!user) return false;
  const { allows = [], denies = [] } = user.permissions || {};

  // 单个权限字符串
  if (typeof required === 'string') {
    return matchSingle(required, allows, denies);
  }

  // { any: [...] } — 任一满足
  if (required.any) {
    return required.any.some(p => matchSingle(p, allows, denies));
  }

  // { all: [...] } — 全部满足
  if (required.all) {
    return required.all.every(p => matchSingle(p, allows, denies));
  }

  // 非预期的权限格式（如 {}、{ invalid: [...] }），记录日志便于排查错误配置
  log.warn(`⚠️ [Guard] 非预期的权限格式: ${JSON.stringify(required)}`);
  return false;
}

/**
 * 基础守卫规则检查（纯函数，不依赖 reply 对象）
 * 用于 WebSocket 等非 HTTP 场景，与 applyGuardLogic 共享同一套规则
 *
 * @param {object} opts - 守卫配置（enabled, allowIps, allowRoles, requireLogin）
 * @param {object|null} user - 用户对象
 * @param {string} clientIp - 客户端 IP
 * @returns {{ passed: boolean, status?: number, message?: string }}
 */
function checkGuardBase(opts, user, clientIp) {
  const { enabled = true, allowIps = [], allowRoles = [], requireLogin = false } = opts;

  if (!enabled) {
    return { passed: false, status: 4003, message: '该安全节点已禁用' };
  }

  if (allowIps.length > 0) {
    const isAllowed = allowIps.some(rule => isIpMatch(clientIp, rule));
    if (!isAllowed) {
      return { passed: false, status: 4003, message: `IP [${clientIp}] 无权访问` };
    }
  }

  // 登录与角色校验：设置了 requireLogin 或 allowRoles 时，必须登录
  if (requireLogin || allowRoles.length > 0) {
    if (!user?.sub) {
      return { passed: false, status: 4001, message: '未登录' };
    }
    if (allowRoles.length > 0) {
      const userRoles = user.roles || [];
      if (!allowRoles.some(r => userRoles.includes(r))) {
        return { passed: false, status: 4003, message: '权限不足' };
      }
    }
  }

  return { passed: true };
}

// =============================================================================
// 4. 核心守卫逻辑
// =============================================================================

/**
 * 核心校验逻辑：执行 IP、登录态及角色检查
 */
async function applyGuardLogic(opts = {}, request, reply) {
  const {
    enabled = true,
    allowIps = [],
    allowRoles = [],
    requireLogin = false,
    requirePermission = null,
    freshPermission = false
  } = opts;

  // 1. 开关检查
  if (!enabled) {
    return reply.result.forbidden('该安全节点当前已禁用');
  }

  // 2. IP 白名单校验
  if (allowIps.length > 0) {
    const clientIp = request.ip;
    const isAllowed = allowIps.some(rule => isIpMatch(clientIp, rule));
    if (!isAllowed) {
      return reply.result.forbidden(`IP [${clientIp}] 无权访问此受保护区域`);
    }
  }

  // 2.5 敏感操作回源校验（第 4 层：freshPermission）
  //
  // 前面的会话/JWT 路径在权限上都已带指纹校验（perm-cache.js），但指纹依赖
  // 「三张权限表的 updatedAt」这一**数据侧可观测面**。以下情况仍可能让陈旧权限蒙混过关：
  //   - 直接 UPDATE 表但绕过 ORM（未刷新 updatedAt，如 `UPDATE ... SET policy=?` 后补写时间戳）
  //   - 指纹计算本身抛错走了"保守回源失败 → 沿用会话副本"的降级分支
  //   - 权限字段被外部写进缓存、且指纹恰好被同步伪造
  // 对"改权限本身""注销账号""导出全量数据"这类**不可逆/高影响**操作，
  // 多一次全量 DB 查询换一次"决策基于当前真实权限"的确定性，是划算的。
  //
  // 仅在路由显式声明 freshPermission=true 时启用：普通读接口不应付出这次查询。
  if (freshPermission) {
    const user = request.state?.user;
    if (!user) {
      return reply.result.unauth('身份验证失败，请先登录');
    }
    // appId 取认证时写入的登录应用；缺省 'GLOBAL' 与 perm-cache 的全局语义一致
    const appId = user.appId || request.state?.session?.appId || 'GLOBAL';
    let fresh;
    try {
      fresh = await getPermissions(user.sub, appId, { fresh: true });
    } catch (err) {
      // 回源失败 → **拒绝**（fail-closed）。这与"权限读取失败降级放行"不同：
      // 敏感操作的默认答案必须是"不执行"。
      log.error(`🚫 [Guard] 敏感操作权限回源失败，拒绝请求: userId=${user.sub}, appId=${appId}`, err);
      return reply.result.forbidden('权限校验服务不可用，请稍后重试');
    }
    // 用回源结果覆盖 request.state.user 的权限，后续 handler 内 allOf/anyOf 读到的也是最新值
    request.state.user = { ...user, roles: fresh.roles, permissions: fresh.permissions };
  }

  // 3. 身份与角色校验
  if (requireLogin || allowRoles.length > 0) {
    const user = request.state?.user;
    if (!user) {
      const authError = request.state?.authError;
      if (authError) {
        if (authError.name === 'TokenExpiredError') {
          reply.code(401).send({ error: 'invalid_token', error_description: 'Token expired' });
          reply.sent = true;
          return;
        }
        reply.code(401).send({
          error: 'invalid_token',
          error_description: authError.name === 'NotBeforeError' ? 'Token not yet valid' : 'Invalid token'
        });
        return;
      }
      return reply.result.unauth('身份验证失败，请先登录');
    }
    if (allowRoles.length > 0) {
      const userRoles = user.roles || [];
      if (!allowRoles.some(r => userRoles.includes(r))) {
        return reply.result.forbidden(`权限不足：需要 [${allowRoles.join('/')}] 角色`);
      }
    }
  }

  // 4. 权限校验
  if (requirePermission) {
    const user = request.state?.user;
    if (!user) {
      return reply.result.unauth('身份验证失败，请先登录');
    }
    if (!checkPermission(requirePermission, user)) {
      const label =
        typeof requirePermission === 'string'
          ? requirePermission
          : (requirePermission.any || requirePermission.all || []).join(', ');
      return reply.result.forbidden(`权限不足：需要 [${label}] 权限`);
    }
  }
}

/**
 * 创建级联守卫 (1 > 2 > 3 权重模型)
 */
function createGuard(systemKey, groupKey, apiKey = null) {
  return async function (request, reply) {
    const startTime = performance.now();

    // 注入上下文到 request.state 供日志审计使用
    if (!request.state) request.state = {};
    request.state.systemKey = systemKey;
    request.state.groupKey = groupKey;
    request.state.apiKey = apiKey;

    // 会话归属校验已移除：靠子域名 cookie 隔离 + PBAC 权限校验保障安全。
    // 登录应用（session.appId）与路由系统（systemKey）分属不同命名空间，
    // 共享系统（User/Auth/OAuth2.1/Verify/Notice）任何登录会话都应可访问。

    // 1级：系统级校验
    const sys = getGuardConfig(systemKey);
    if (sys) {
      await applyGuardLogic(sys, request, reply);
      if (reply.sent) return;
    }

    // 2级：模块级校验
    const group = getGuardConfig(systemKey, groupKey);
    if (group) {
      await applyGuardLogic(group, request, reply);
      if (reply.sent) return;
    }

    // 3级：API 级校验
    if (apiKey) {
      const api = getGuardConfig(systemKey, groupKey, apiKey);
      if (api) {
        await applyGuardLogic(api, request, reply);
      }
    }

    // 计算校验耗时
    const duration = (performance.now() - startTime).toFixed(3);

    // 统一日志出口（wb-logkit）：进入 logs/*.log 文件，参与脱敏/分级/错误文件机制
    log.info(`🛡️ [Guard] 安全校验通过 | 耗时: ${duration}ms`, {
      guard: { systemKey, groupKey, apiKey },
      duration: `${duration}ms`
    });
  };
}

// =============================================================================
// 5. 公共 API — 上下文管理
// =============================================================================

/**
 * 【Loader 调用】设置当前扫描的系统上下文
 */
function setRegistrationContext(systemKey) {
  // 空字符串、null、undefined 均使用固定默认值，避免随机数导致路由注册到不可预期的系统
  currentSystem =
    systemKey && typeof systemKey === 'string' && systemKey.trim().length > 0 ? systemKey.trim() : 'system-default';
  currentGroup = ''; // 重置组
  currentPrefix = ''; // 重置前缀
}

/**
 * 【Loader 调用】获取当前注册上下文（供 07-api.js 保存/恢复）
 */
function getRegistrationContext() {
  return { currentSystem, currentGroup, currentPrefix };
}

/**
 * 【Loader 调用】恢复注册上下文（供 07-api.js 在 loadRouteFile 后还原）
 */
function restoreRegistrationContext(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    log.warn('⚠️ [Guard] restoreRegistrationContext: ctx 参数无效');
    return;
  }
  currentSystem = ctx.currentSystem;
  currentGroup = ctx.currentGroup;
  currentPrefix = ctx.currentPrefix;
}

// =============================================================================
// 6. 公共 API — 路由注册
// =============================================================================

/**
 * 【Level 2】注册模块/文件级元数据
 * 支持单对象签名：registerGroupMetadata({ name: 'key', ... })
 * 无需手动指定 System，Loader 会根据文件夹自动设置上下文
 */
function registerGroupMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    log.warn('⚠️ [Guard] registerGroupMetadata: metadata 参数无效');
    return;
  }

  const groupKey = metadata.name || 'default';
  currentGroup = groupKey;
  currentPrefix = metadata.prefix || '';

  // 如果 metadata 显式指定了 system，则覆盖自动推导的值
  const systemKey = currentSystem;

  rawRegisterGroupMetadata(systemKey, groupKey, metadata);
}

/**
 * 【Level 3】高层级安全路由注册
 */
function registerSecureRoute(fastify, options) {
  // 参数防御性校验
  if (!options || typeof options !== 'object') {
    const err = new Error('registerSecureRoute: options 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (!fastify || typeof fastify !== 'object') {
    const err = new Error('registerSecureRoute: fastify 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const {
    name,
    alias,
    method,
    url,
    handler,
    schema = {},
    config = {},
    allowRoles = [],
    allowIps = [],
    requireLogin = false,
    requireSignature = false,
    requirePermission = null,
    permission = null,
    // 敏感操作回源校验（第 4 层）：见 applyGuardLogic 中 2.5 节的说明。
    // 默认关闭 —— 每开一个就多一次 3 表查询，只给不可逆/高影响操作开。
    freshPermission = false
  } = options;

  // 参数防御性校验
  if (!method || typeof method !== 'string') {
    const err = new Error(`registerSecureRoute: method 参数无效，name=${name || 'unnamed'}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (!url || typeof url !== 'string') {
    const err = new Error(`registerSecureRoute: url 参数无效，name=${name || 'unnamed'}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (typeof handler !== 'function') {
    const err = new Error(`registerSecureRoute: handler 必须是函数，name=${name || 'unnamed'}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  // permission 是 requirePermission 的短别名
  const perm = requirePermission || permission;

  const targetSystem = currentSystem || 'system-default';
  const targetGroup = options.group || currentGroup;
  const apiKey = name || url.replace(/\//g, '_');

  const systemConfig = getGuardConfig(targetSystem);
  const systemPrefix = systemConfig?.prefix || '';
  const fullUrl = '/' + joinUrl(systemPrefix, currentPrefix, url);
  const methodUpper = method.toUpperCase();

  // ⚡ 实时路由重复检测：在 Fastify 注册前主动拦截，避免错误延后暴露到无关模块
  const routeKey = `${methodUpper}:${fullUrl}`;
  if (_routeRegistry.has(routeKey)) {
    const dup = _routeRegistry.get(routeKey);
    const err = new Error(
      `路由重复注册: ${methodUpper} ${fullUrl}\n` +
        `  → 首次注册: [${dup.group}] ${dup.name}\n` +
        `  → 重复注册: [${targetGroup}] ${name}`
    );
    err.code = 'DUPLICATE_ROUTE';
    throw err;
  }
  _routeRegistry.set(routeKey, { group: targetGroup, name, fullUrl, method: methodUpper });

  registerApiMetadata(targetSystem, targetGroup, apiKey, {
    alias,
    url: fullUrl,
    method: methodUpper,
    allowRoles,
    allowIps,
    requireLogin,
    requirePermission: perm,
    freshPermission
  });

  // 需要登录的路由自动标记需要签名验证；requireSignature 可单独开启（公开端点防爬）
  const routeConfig = { ...config };
  if (requireLogin || requireSignature) {
    routeConfig.requireSignature = true;
  }
  // 把 requireLogin 也放进路由 config：Fastify 的 onRequest 在**路由匹配之后**执行，
  // 因此下游（如防火墙的 onRequest 钩子）能读到 `request.routeOptions.config`，
  // 在不跨 app 依赖 guard 配置表的前提下判断「这个请求注定会被守卫 401」。
  // 只读元数据，不参与鉴权决策 —— 鉴权仍然完全由 preHandler 的级联守卫负责。
  if (requireLogin) routeConfig.requireLogin = true;

  // 注入级联 Guard 并注册 Fastify 路由
  fastify[method.toLowerCase()](fullUrl, {
    schema,
    config: routeConfig,
    preHandler: createGuard(targetSystem, targetGroup, apiKey),
    handler
  });
}

/**
 * 注册受保护的 WebSocket 路由
 * 使用与 HTTP 路由相同的三级守卫机制（System → Group → API）
 * 支持 IP 白名单、角色校验、权限校验和登录校验
 *
 * 注意：HTTP 路由的 applyGuardLogic 遇到 authError（TokenExpiredError 等）
 * 会返回 JSON 错误体，WebSocket 只有 close code，无法携带 JSON 错误详情。
 * 因此 WebSocket 的 authError 会在 close 时简化为通用 4001 码。
 *
 * @param {object} fastify - Fastify 实例
 * @param {object} options - 路由选项
 * @param {string} options.url - WebSocket URL
 * @param {string} [options.group] - 所属模块组，默认使用 currentGroup
 * @param {boolean} [options.requireLogin=true] - 是否需要登录
 * @param {string[]} [options.allowRoles=[]] - 允许的角色
 * @param {string[]} [options.allowIps=[]] - IP 白名单（支持通配符/CIDR）
 * @param {string|object} [options.requirePermission=null] - 权限校验
 * @param {Function} options.handler - WebSocket 处理函数 (connection, req, client) => void
 */
function registerSecureWebSocket(fastify, options) {
  if (!fastify || typeof fastify !== 'object') {
    const err = new Error('registerSecureWebSocket: fastify 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (!options || typeof options !== 'object') {
    const err = new Error('registerSecureWebSocket: options 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (typeof options.handler !== 'function') {
    const err = new Error('registerSecureWebSocket: handler 必须是函数');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const {
    url,
    group,
    requireLogin = true,
    allowRoles = [],
    allowIps = [],
    requirePermission = null,
    handler
  } = options;

  // url 参数校验
  if (!url || typeof url !== 'string') {
    const err = new Error('registerSecureWebSocket: url 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const targetSystem = currentSystem;
  const targetGroup = group || currentGroup;
  const apiKey = `ws:${url.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // 在守卫配置中注册该 WebSocket 路由，支持三级级联校验
  registerApiMetadata(targetSystem, targetGroup, apiKey, {
    url,
    method: 'WS',
    allowRoles,
    allowIps,
    requireLogin,
    requirePermission
  });

  fastify.get(url, { websocket: true }, async (connection, req) => {
    const client = connection.socket || connection;
    const user = req.state?.user;
    const clientIp = req.ip;

    // 1. 系统级校验
    const sys = getGuardConfig(targetSystem);
    if (sys) {
      const result = checkGuardBase(sys, user, clientIp);
      if (!result.passed) {
        if (client?.close) client.close(result.status, result.message);
        return;
      }
    }

    // 2. 模块级校验
    const grp = getGuardConfig(targetSystem, targetGroup);
    if (grp) {
      const result = checkGuardBase(grp, user, clientIp);
      if (!result.passed) {
        if (client?.close) client.close(result.status, result.message);
        return;
      }
    }

    // 3. API 级校验
    const api = getGuardConfig(targetSystem, targetGroup, apiKey);
    if (api) {
      const result = checkGuardBase(api, user, clientIp);
      if (!result.passed) {
        if (client?.close) client.close(result.status, result.message);
        return;
      }
    }

    // 4. 当前路由选项级的 IP 白名单校验（高于配置的层级）
    if (allowIps.length > 0) {
      const isAllowed = allowIps.some(rule => isIpMatch(clientIp, rule));
      if (!isAllowed) {
        if (client?.close) client.close(4003, `IP [${clientIp}] 无权访问`);
        return;
      }
    }

    // 5. 登录校验（设置了 requireLogin 或 allowRoles 或 requirePermission 时，必须登录）
    if ((requireLogin || allowRoles.length > 0 || requirePermission) && !user?.sub) {
      if (client?.close) client.close(4001, '未登录');
      return;
    }

    // 6. 当前路由选项级的角色校验
    if (allowRoles.length > 0 && user) {
      const userRoles = user.roles || [];
      if (!allowRoles.some(r => userRoles.includes(r))) {
        if (client?.close) client.close(4003, '权限不足');
        return;
      }
    }

    // 7. 当前路由选项级的权限校验
    if (requirePermission) {
      if (!checkPermission(requirePermission, user)) {
        if (client?.close) client.close(4003, '权限不足');
        return;
      }
    }

    // 守卫通过，执行业务处理
    handler(connection, req, client);
  });
}

// =============================================================================
// 7. 公共 API — 辅助函数
// =============================================================================

/**
 * 外部辅助：获取当前上下文下的完整 URL (用于 WebSockets 等手动注册场景)
 */
function getFullUrl(url) {
  if (!url || typeof url !== 'string') {
    const err = new Error('getFullUrl: url 参数无效');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const systemConfig = getGuardConfig(currentSystem);
  const systemPrefix = systemConfig?.prefix || '';
  const full = '/' + joinUrl(systemPrefix, currentPrefix, url);
  return full;
}

// =============================================================================
// 8. 导出
// =============================================================================

export {
  createGuard,
  setRegistrationContext,
  getRegistrationContext,
  restoreRegistrationContext,
  registerGroupMetadata,
  registerSecureRoute,
  registerSecureWebSocket,
  getFullUrl,
  registerSystemMetadata,
  // 仅供测试直接驱动守卫核心逻辑。前缀 `__test__` 明示"非公开 API"，
  // 生产代码不应调用 —— 正常路径是经 createGuard 生成的 preHandler。
  applyGuardLogic as __test__applyGuardLogic
};
