// src/api/guard.js
// ─────────────────────────────────────────────────────────────────────────────
// 🔐 企业级三级安全编排引擎 (Next-Gen Security Engine)
// ─────────────────────────────────────────────────────────────────────────────
// 支持：System (层) -> Group (文件) -> API (接口) 的级联校验与动态热更新
// ─────────────────────────────────────────────────────────────────────────────

import {
  getGuardConfig,
  registerApiMetadata,
  registerSystemMetadata,
  registerGroupMetadata as rawRegisterGroupMetadata
} from './guard-config.js';

/**
 * 注册受保护的 WebSocket 路由
 * 使用与 HTTP 路由相同的三级守卫机制
 *
 * @param {object} fastify - Fastify 实例
 * @param {object} options - 路由选项
 * @param {string} options.url - WebSocket URL
 * @param {boolean} [options.requireLogin=true] - 是否需要登录
 * @param {string[]} [options.allowRoles=[]] - 允许的角色
 * @param {Function} options.handler - WebSocket 处理函数 (connection, req, client) => void
 */
export function registerSecureWebSocket(fastify, options) {
  const {
    url,
    requireLogin = true,
    allowRoles = [],
    handler
  } = options;

  const targetSystem = currentSystem;

  fastify.get(url, { websocket: true }, async (connection, req) => {
    const client = connection.socket || connection;

    // 执行守卫逻辑
    const user = req.state?.user;

    // 检查系统级开关
    if (targetSystem) {
      const sys = getGuardConfig(targetSystem);
      if (sys && !sys.enabled) {
        if (client?.close) client.close(4003, '系统已禁用');
        return;
      }
    }

    // 检查登录状态
    if (requireLogin && !user?.sub) {
      if (client?.close) client.close(4001, '未登录');
      return;
    }

    // 检查角色
    if (allowRoles.length > 0 && user) {
      const userRoles = user.roles || [];
      if (!allowRoles.some(r => userRoles.includes(r))) {
        if (client?.close) client.close(4003, '权限不足');
        return;
      }
    }

    // 守卫通过，执行业务处理
    handler(connection, req, client);
  });
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

  return false;
}

/**
 * 高性能 IP 匹配引擎
 */
function isIpMatch(clientIp, rule) {
  if (rule === '*' || rule === '0.0.0.0/0') return true;
  if (clientIp === rule) return true;

  // 1. 处理通配符规则: 192.168.1.*
  if (rule.includes('*')) {
    const prefix = rule.split('*')[0];
    return clientIp.startsWith(prefix);
  }

  // 2. 处理 CIDR 规则: 192.168.1.0/24
  if (rule.includes('/')) {
    try {
      const [range, bits] = rule.split('/');
      const mask = ~((1 << (32 - bits)) - 1);
      const ipToLong = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
      return (ipToLong(clientIp) & mask) === (ipToLong(range) & mask);
    } catch (err) {
      console.error('IP 匹配规则错误:', err);
      return false;
    }
  }

  return false;
}

/**
 * 核心校验逻辑：执行 IP、登录态及角色检查
 */
async function applyGuardLogic(opts = {}, request, reply) {
  const { enabled = true, allowIps = [], allowRoles = [], requireLogin = false, requirePermission = null } = opts;

  // 1. 开关检查
  if (!enabled) {
    return reply.result.forbidden('该安全节点当前已禁用');
  }

  // 2. IP 白名单校验
  if (allowIps.length > 0) {
    const clientIp = request.ip;
    const isAllowed = allowIps.some((rule) => isIpMatch(clientIp, rule));
    if (!isAllowed) {
      return reply.result.forbidden(`IP [${clientIp}] 无权访问此受保护区域`);
    }
  }

  // 3. 身份与角色校验
  if (requireLogin || allowRoles.length > 0) {
    const user = request.state?.user;
    if (!user) {
      const authError = request.state?.authError;
      if (authError) {
        if (authError.name === 'TokenExpiredError') {
          return reply.code(401).send({
            error: 'invalid_token',
            error_description: 'Token expired'
          });
        }
        return reply.code(401).send({
          error: 'invalid_token',
          error_description: authError.name === 'NotBeforeError' ? 'Token not yet valid' : 'Invalid token'
        });
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
      const label = typeof requirePermission === 'string'
        ? requirePermission
        : (requirePermission.any || requirePermission.all || []).join(', ');
      return reply.result.forbidden(`权限不足：需要 [${label}] 权限`);
    }
  }
}

/**
 * 创建级联守卫 (1 > 2 > 3 权重模型)
 */
export function createGuard(systemKey, groupKey, apiKey = null) {
  return async function (request, reply) {
    const startTime = performance.now();

    // 注入上下文到 request.state 供日志审计使用
    if (!request.state) request.state = {};
    request.state.systemKey = systemKey;
    request.state.groupKey = groupKey;
    request.state.apiKey = apiKey;

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

    // 使用 Fastify 内置 Pino 日志打印统计信息
    request.log.info(
      {
        guard: { systemKey, groupKey, apiKey },
        duration: `${duration}ms`
      },
      `🛡️  [Guard] 安全校验通过 | 耗时: ${duration}ms`
    );
  };
}

// 当前文件的注册上下文 (由 Loader 自动维护)
let currentSystem = 'api-' + Math.random().toString(36).substring(7);
let currentGroup = '';
let currentPrefix = '';

export { registerSystemMetadata };

/**
 * 【Loader 调用】设置当前扫描的系统上下文
 */
export function setRegistrationContext(systemKey) {
  currentSystem = systemKey || 'api-' + Math.random().toString(36).substring(7);
  currentGroup = ''; // 重置组
  currentPrefix = ''; // 重置前缀
}

/**
 * 【Level 2】注册模块/文件级元数据
 * 支持单对象签名：registerGroupMetadata({ name: 'key', ... })
 * 无需手动指定 System，Loader 会根据文件夹自动设置上下文
 */
export function registerGroupMetadata(metadata) {
  const groupKey = metadata.name || 'default';
  currentGroup = groupKey;
  currentPrefix = metadata.prefix || '';

  // 如果 metadata 显式指定了 system，则覆盖自动推导的值
  const systemKey = currentSystem;

  rawRegisterGroupMetadata(systemKey, groupKey, metadata);
}

/**
 * 辅助函数：安全拼接 URL
 */
function joinUrl(...parts) {
  return parts
    .map((part) => part.replace(/(^\/+|\/+$)/g, '')) // 去掉两端斜杠
    .filter((part) => part.length > 0)
    .join('/');
}

/**
 * 外部辅助：获取当前上下文下的完整 URL (用于 WebSockets 等手动注册场景)
 */
export function getFullUrl(url) {
  const systemConfig = getGuardConfig(currentSystem);
  const systemPrefix = systemConfig?.prefix || '';
  const full = '/' + joinUrl(systemPrefix, currentPrefix, url);
  // console.log(`🔍 [Guard:getFullUrl] system=${currentSystem}, prefix=${currentPrefix}, url=${url} -> ${full}`);
  return full;
}

/**
 * 【Level 3】高层级安全路由注册
 */
export function registerSecureRoute(fastify, options) {
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
    requirePermission = null,
    permission = null
  } = options;

  // permission 是 requirePermission 的短别名
  const perm = requirePermission || permission;

  const targetSystem = currentSystem || 'api-' + Math.random().toString(36).substring(7);
  const targetGroup = options.group || currentGroup;
  const apiKey = name || url.replace(/\//g, '_');

  const systemConfig = getGuardConfig(targetSystem);
  const systemPrefix = systemConfig?.prefix || '';
  const fullUrl = '/' + joinUrl(systemPrefix, currentPrefix, url);

  registerApiMetadata(targetSystem, targetGroup, apiKey, {
    alias,
    url: fullUrl,
    method: method.toUpperCase(),
    allowRoles,
    allowIps,
    requireLogin,
    requirePermission: perm
  });

  // 4. 需要登录的路由自动标记需要签名验证
  const routeConfig = { ...config };
  if (requireLogin) {
    routeConfig.requireSignature = true;
  }

  // 5. 注入级联 Guard 并注册 Fastify 路由
  fastify[method.toLowerCase()](fullUrl, {
    schema,
    config: routeConfig,
    preHandler: createGuard(targetSystem, targetGroup, apiKey),
    handler
  });
}
