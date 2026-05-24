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
  const { enabled = true, allowIps = [], allowRoles = [], requireLogin = false } = opts;

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
    if (allowRoles.length > 0 && !allowRoles.includes(user.role)) {
      return reply.result.forbidden(`权限不足：需要 [${allowRoles.join('/')}] 角色`);
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
    requireLogin = false
  } = options;

  const targetSystem = currentSystem || 'api-' + Math.random().toString(36).substring(7); //随机名不能重复
  const targetGroup = options.group || currentGroup;
  const apiKey = name || url.replace(/\//g, '_');

  // 1. 获取系统级前缀 (Level 1)
  const systemConfig = getGuardConfig(targetSystem);
  const systemPrefix = systemConfig?.prefix || '';

  // 2. 拼接最终 URL (System + Group + Route)
  const fullUrl = '/' + joinUrl(systemPrefix, currentPrefix, url);

  // 3. 同步到配置中心
  registerApiMetadata(targetSystem, targetGroup, apiKey, {
    alias,
    url: fullUrl,
    method: method.toUpperCase(),
    allowRoles,
    allowIps,
    requireLogin
  });

  // 4. 注入级联 Guard 并注册 Fastify 路由
  fastify[method.toLowerCase()](fullUrl, {
    schema,
    config,
    preHandler: createGuard(targetSystem, targetGroup, apiKey),
    handler
  });
}
