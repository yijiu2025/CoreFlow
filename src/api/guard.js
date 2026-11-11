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
import { isIpMatch } from '../framework/ingress/net/ip.js';
import { getPermissions } from '../framework/security/auth/index.js';
import { createSafePreHandler } from '../framework/security/auth/index.js';
import { isWildcardMatch } from '../framework/security/auth/permission/wildcard-match.js';
import { isUserManuallyBlocked } from '../framework/ingress/firewall/block-manager.js';
import { createLogger } from '../framework/support/log/index.js';
import { resolvePermissionAppId } from '../framework/config/app-registry.js';

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

/**
 * 签名校验的执行者作用域
 *
 * `verifySignature` 目前只有**一个**生产执行入口：oauth21 的全局 `preHandler`
 * （`initOAuthMiddleware`，经 `rootPlugins` 挂在根作用域），而它自带前缀闸门，
 * 只处理 `/oauth2.1` 及其子路径。`createGuard` 不调用 `verifySignature`。
 *
 * 🔴 所以 `requireSignature: true` 写在别的域里**不会生效、不会报错、也不会有任何提示**
 *    —— 它是一个"看起来有防护"的死配置。2026-11-10 在 `src/api/user/v1/open.js`
 *    发现 5 处（注册 / 校验邮箱 / 两种重置密码 / 发重置链接），已清理。
 *
 * 为什么不能干脆让 guard 全局接上：`requireLogin` 会自动把 `requireSignature` 置 true，
 * 而实现签名拦截器的前端目前只有 oauth21 自己 —— 全局接线会让 firewall / posecraft /
 * retroweb / admin 的登录态请求全部 403（见 `app/oauth21/middleware/auth.middleware.js` 头注释）。
 */
const SIGNATURE_EXECUTOR_PREFIX = '/oauth2.1';

/** 已告警过的路由（避免同一进程内重复刷日志） */
const _warnedSignatureDeclarations = new Set();

/**
 * 该 URL 是否落在签名校验的执行者作用域内
 *
 * 纯函数（导出给约定测试），判据只有一条：是否在 `/oauth2.1` 前缀内。
 * `/oauth2.10/...` 不算 —— 与 `auth.middleware.js` 的 `isOAuth21Request` 保持同一口径。
 *
 * @param {string} fullUrl - 含 system/group 前缀的完整路径
 * @returns {boolean}
 */
function hasSignatureExecutor(fullUrl) {
  if (typeof fullUrl !== 'string' || !fullUrl) return false;
  return fullUrl === SIGNATURE_EXECUTOR_PREFIX || fullUrl.startsWith(`${SIGNATURE_EXECUTOR_PREFIX}/`);
}

/**
 * 组级默认端点限频表：group → { max, timeWindow, ... }
 *
 * 由 `registerGroupMetadata({ rateLimit })` 声明，`registerSecureRoute` 在路由**没有**
 * 自己声明 `config.rateLimit` 时继承。为什么按组而不是逐条写：
 *   - 一组动辄 20+ 路由，逐条声明漏一条就是"这个端点裸奔"，而且看不出来；
 *   - groupId 由 `组名 + 路由名` 自动生成 ⇒ 同组内每个端点各自一个桶，
 *     @fastify/rate-limit 默认按 IP 共享一个键，会让高流量端点吃掉低流量端点的额度。
 */
const _groupRateLimits = new Map();

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
 *
 * 2026-11-01 收拢到 framework/security/auth/permission/wildcard-match.js（单一来源，与
 * StpUtil._isMatch 共用）。原实现只支持尾部 `:*`（中段通配 `user:*:read` 不生效）；
 * 共享版按转义正则匹配，尾部/中段通配语义一致，其余字符严格按字面量。
 * @param {string} pattern - 权限模式，如 'user:page:read' 或 'user:page:*'
 * @param {string} target - 用户实际拥有的权限
 * @returns {boolean}
 */
function isPermissionMatch(pattern, target) {
  return isWildcardMatch(pattern, target);
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
 * 节点级「开关 + IP 白名单」校验（与登录态无关）
 *
 * 为什么拆成两个谓词而不是一个"一次判完"的函数：`applyGuardLogic` 必须在登录校验
 * **之前**插入两件事 —— 账号级封禁（与层级无关）和 freshPermission（它会替换 user）。
 * 拆成 access / identity 两段，规则只有一份实现，HTTP 的既有顺序也不变。
 *
 * @param {object} opts - 节点配置（enabled / allowIps）
 * @param {string} clientIp - 客户端 IP
 * @returns {{ passed: boolean, status?: number, message?: string }}
 */
function checkNodeAccess(opts, clientIp) {
  const { enabled = true, allowIps = [] } = opts || {};

  if (!enabled) {
    return { passed: false, status: 4003, message: '该安全节点当前已禁用' };
  }

  if (allowIps.length > 0 && !allowIps.some(rule => isIpMatch(clientIp, rule))) {
    return { passed: false, status: 4003, message: `IP [${clientIp}] 无权访问此受保护区域` };
  }

  return { passed: true };
}

/**
 * 节点级「登录 + 角色 + 权限」校验（依赖 user）
 *
 * status 语义：4001 = 未登录（HTTP 译作 401），4003 = 已登录但无权（403）。
 * `requirePermission` 也隐含要求登录 —— 与旧实现等价（旧实现缺 user 时同样返回
 * "身份验证失败，请先登录"），这里把这条隐含前提写出来，避免以后有人只改一半。
 *
 * @param {object} opts - 节点配置（requireLogin / allowRoles / requirePermission）
 * @param {object|null} user - 用户对象
 * @returns {{ passed: boolean, status?: number, message?: string }}
 */
function checkNodeIdentity(opts, user) {
  const { allowRoles = [], requireLogin = false, requirePermission = null } = opts || {};

  if (requireLogin || allowRoles.length > 0 || requirePermission) {
    if (!user?.sub) {
      return { passed: false, status: 4001, message: '身份验证失败，请先登录' };
    }
    if (allowRoles.length > 0) {
      const userRoles = user.roles || [];
      if (!allowRoles.some(r => userRoles.includes(r))) {
        return { passed: false, status: 4003, message: `权限不足：需要 [${allowRoles.join('/')}] 角色` };
      }
    }
  }

  if (requirePermission && !checkPermission(requirePermission, user)) {
    const label =
      typeof requirePermission === 'string'
        ? requirePermission
        : (requirePermission.any || requirePermission.all || []).join(', ');
    return { passed: false, status: 4003, message: `权限不足：需要 [${label}] 权限` };
  }

  return { passed: true };
}

/**
 * 基础守卫规则检查（纯函数，不依赖 reply 对象）
 *
 * **唯一实现**：`applyGuardLogic`（HTTP）与 `registerSecureWebSocket`（WS）都走这里，
 * 区别只在于把结果翻译成 `reply` 还是 `client.close()`。
 * 历史教训：这三处曾各写一份，登录判据一度是 `!user` / `!user?.sub` 混用，
 * 且 WS 那份漏了 `requirePermission` —— 改一处忘两处不会有任何报错。
 *
 * @param {object} opts - 守卫配置（enabled / allowIps / allowRoles / requireLogin / requirePermission）
 * @param {object|null} user - 用户对象
 * @param {string} clientIp - 客户端 IP
 * @returns {{ passed: boolean, status?: number, message?: string }}
 */
function checkGuardBase(opts, user, clientIp) {
  const access = checkNodeAccess(opts, clientIp);
  if (!access.passed) return access;
  return checkNodeIdentity(opts, user);
}

// =============================================================================
// 4. 核心守卫逻辑
// =============================================================================

/**
 * 核心校验逻辑：执行 IP、登录态、角色与权限检查
 *
 * 规则本体在 `checkNodeAccess` / `checkNodeIdentity`（与 WebSocket 共用同一份实现），
 * 这里只负责**顺序**与**把结果翻译成 reply**：
 *   ① 开关 + IP → ② freshPermission 回源（会替换 user，必须早于身份校验）
 *   → ③ 登录 + 角色 + 权限
 *
 * 账号级封禁（firewall 的 manualBlacklistUsers）不在这里：它不属于任何一级，
 * 由 `createGuard` 每请求判一次（原先写在这里，而本函数被三级各调一次 = 重复判 3 次）。
 */
async function applyGuardLogic(opts = {}, request, reply) {
  const { freshPermission = false } = opts;

  // 1. 开关 + IP 白名单
  const access = checkNodeAccess(opts, request.ip);
  if (!access.passed) {
    return reply.result.forbidden(access.message);
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
    // 🔴 getPermissions 必须传数字主键（UserRole.user_id 是数字列）：state.user.sub/uid
    // 是对外 UUID，传 sub 会静默查空 → fresh 恒为空权限集 → 所有 freshPermission 路由
    // 必 403（2026-11-01 修复，与 bearer-auth P1 同型：传 uid vs 数字主键）。
    // client_token（M2M）没有用户主键，同样无 fresh 权限语义，直接拒绝。
    if (user.userId == null) {
      return reply.result.forbidden('当前凭证无用户级权限语义，禁止执行敏感操作');
    }
    // appId 取认证时写入的登录应用；缺省 'GLOBAL' 与 perm-cache 的全局语义一致。
    // 再经 `resolvePermissionAppId` 映射到**权限命名空间**：console 的角色住在
    // `admin` 下，直接按登录 appId 回源会拿到空权限集，敏感操作全部误拒。
    const appId = user.appId || request.state?.session?.appId || 'GLOBAL';
    const permAppId = resolvePermissionAppId(appId);
    let fresh;
    try {
      fresh = await getPermissions(user.userId, permAppId, { fresh: true });
    } catch (err) {
      // 回源失败 → **拒绝**（fail-closed）。这与"权限读取失败降级放行"不同：
      // 敏感操作的默认答案必须是"不执行"。
      log.error(`🚫 [Guard] 敏感操作权限回源失败，拒绝请求: userId=${user.userId}, appId=${appId}`, err);
      return reply.result.forbidden('权限校验服务不可用，请稍后重试');
    }
    // 用回源结果覆盖 request.state.user 的权限，后续 handler 内 allOf/anyOf 读到的也是最新值
    request.state.user = { ...user, roles: fresh.roles, permissions: fresh.permissions };
  }

  // 3. 登录 + 角色 + 权限（规则本体在 checkNodeIdentity，与 WS 共用同一份）
  const identity = checkNodeIdentity(opts, request.state?.user);
  if (identity.passed) return;

  // 4001 = 未登录。JWT 失效要给 OAuth 语义的 invalid_token，普通会话走 unauth。
  if (identity.status === 4001) {
    const authError = request.state?.authError;
    if (authError) {
      if (authError.name === 'TokenExpiredError') {
        // 不要再写 `reply.sent = true`：Fastify 5 的 reply.sent 是**只读 getter**，
        // ESM 严格模式下赋值会抛 TypeError（被上层当成 500 记录），而 send() 本身
        // 已经把 sent 置为 true —— createGuard 里的 reply.sent 判断照常成立。
        reply.code(401).send({ error: 'invalid_token', error_description: 'Token expired' });
        return;
      }
      reply.code(401).send({
        error: 'invalid_token',
        error_description: authError.name === 'NotBeforeError' ? 'Token not yet valid' : 'Invalid token'
      });
      return;
    }
    return reply.result.unauth(identity.message);
  }

  // 4003 = 已登录但角色/权限不足
  return reply.result.forbidden(identity.message);
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

    // 0 级：账号级封禁（firewall 的 manualBlacklistUsers 执行点）
    //
    // 不属于任何一级 —— 原先写在 applyGuardLogic 里，而它被三级各调一次，
    // 同一个请求会重复判定 3 次（判定本身无 I/O，但语义上它就该只判一次）。
    // 历史缺口：面板拉黑用户曾只写配置、从未被执行（ip 维度在认证前生效，
    // 用户身份此时还不存在）；认证完成后在这里拦。firewall 应用卸载时
    // 配置为空数组，本检查恒 false，不构成硬依赖。
    const fwUser = request.state.user;
    if (fwUser && isUserManuallyBlocked(fwUser)) {
      log.warn(`🚫 [Guard] 命中防火墙手动用户黑名单: uid=${fwUser.uid}`);
      return reply.result.forbidden('该账号已被安全策略限制访问');
    }

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

  // 组级默认端点限频（可选）：只对「自己没声明 config.rateLimit」的路由生效
  if (metadata.rateLimit && typeof metadata.rateLimit === 'object') {
    _groupRateLimits.set(groupKey, { ...metadata.rateLimit });
  } else {
    _groupRateLimits.delete(groupKey);
  }

  // 系统归属**只**由 loader 推导（setRegistrationContext 按文件夹设置）：
  // 不读 metadata.system —— 开第二个来源会让"配置落到哪个系统"取决于两处，
  // 写错时既不报错也无日志，只表现为守卫配置莫名不生效。
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
    freshPermission = false,
    // 二级认证（safe.js）：声明后该路由在守卫之后追加 createSafePreHandler，
    // 要求当前用户处于 openSafe(service) 时间窗内，否则 403 SECOND_AUTH_REQUIRED
    safe = null,
    // 风险豁免声明：设备指纹变更（warn 级）会拦截高风险写操作（非 GET），
    // 退出/切换账号/人机验证等端点若不豁免会死锁（退不出、验不了）。
    // 🔴 单一事实源 = 路由声明位（前缀无关、改名即随路由走），
    // 由 anomaly-detector.isHighRiskRequest 在 onRequest 读取 routeOptions.config 消费。
    riskExempt = false
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
    freshPermission,
    safe,
    riskExempt
  });

  // 需要登录的路由自动标记需要签名验证；requireSignature 可单独开启（公开端点防爬）
  //
  // 🔴 这个标记只是**元数据**：真正执行签名校验的只有 oauth21 的全局钩子（/oauth2.1 作用域）。
  //    在别的域里 `requireLogin` 带来的这个 true 同样没有执行者 —— 那是历史行为，
  //    不要指望它提供防护（目前其他前端也没有签名拦截器）。
  const routeConfig = { ...config };

  // 组级默认端点限频：路由自己声明了 config.rateLimit 就用路由的（更具体者优先），
  // 否则继承组的声明。groupId 必须带路由名 —— 组内共享一个 groupId 等于组内共用额度。
  const groupRateLimit = _groupRateLimits.get(targetGroup);
  if (groupRateLimit && !routeConfig.rateLimit) {
    routeConfig.rateLimit = { ...groupRateLimit, groupId: `${targetGroup}-${apiKey}` };
  }
  if (requireLogin || requireSignature) {
    routeConfig.requireSignature = true;
  }

  // 死配置自检：**显式**声明 requireSignature（requireLogin 隐式推导的不算，那是历史噪音），
  // 却落在执行者作用域之外 → 配置永远不会生效，启动时告警一次。
  // 不阻断启动：这是"声明写错了"，不是"服务起不来"。
  if (requireSignature && !hasSignatureExecutor(fullUrl) && !_warnedSignatureDeclarations.has(fullUrl)) {
    _warnedSignatureDeclarations.add(fullUrl);
    log.warn(
      `⚠️ [Guard] ${methodUpper} ${fullUrl} 显式声明了 requireSignature，但签名校验只在 ` +
        `${SIGNATURE_EXECUTOR_PREFIX} 作用域内有执行者 —— 该声明不会生效（应删除或改由端点限频/防火墙保护）`
    );
  }
  // 把 requireLogin 也放进路由 config：Fastify 的 onRequest 在**路由匹配之后**执行，
  // 因此下游（如防火墙的 onRequest 钩子）能读到 `request.routeOptions.config`，
  // 在不跨 app 依赖 guard 配置表的前提下判断「这个请求注定会被守卫 401」。
  // 只读元数据，不参与鉴权决策 —— 鉴权仍然完全由 preHandler 的级联守卫负责。
  if (requireLogin) routeConfig.requireLogin = true;
  // 风险豁免标志进路由 config：anomaly-detector 的 onRequest 钩子读
  // request.routeOptions.config.riskExempt 判定是否放行（onRequest 在路由匹配后执行）
  if (riskExempt) routeConfig.riskExempt = true;

  // 二级认证：safe 声明非空时，守卫之后追加 checkSafe preHandler（数组形式，
  // Fastify 按声明顺序执行：先三级守卫、后二级认证 —— 未登录到不了二级认证）
  const preHandler = safe
    ? [createGuard(targetSystem, targetGroup, apiKey), createSafePreHandler(safe)]
    : createGuard(targetSystem, targetGroup, apiKey);

  // 注入级联 Guard 并注册 Fastify 路由
  fastify[method.toLowerCase()](fullUrl, {
    schema,
    config: routeConfig,
    preHandler,
    handler
  });

  // 返回注册结果：调用方（如 verify-challenge）可拿到解析后的真实 fullUrl
  // （system.json.prefix + 组前缀 + url），避免各处手拼完整路径
  return { name, fullUrl, method: methodUpper };
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

  // ⚡ 与 HTTP 同款重复检测：Fastify 对重复的 `get(url)` 会自己抛，但那时已经
  // 写进配置树了（registerApiMetadata 在前），报错信息也看不出是谁重复注册。
  const routeKey = `WS:${url}`;
  if (_routeRegistry.has(routeKey)) {
    const dup = _routeRegistry.get(routeKey);
    const err = new Error(
      `WebSocket 路由重复注册: ${url}\n  → 首次注册: [${dup.group}] ${dup.name}\n  → 重复注册: [${targetGroup}] ${options.name || apiKey}`
    );
    err.code = 'DUPLICATE_ROUTE';
    throw err;
  }
  _routeRegistry.set(routeKey, { group: targetGroup, name: options.name || apiKey, fullUrl: url, method: 'WS' });

  fastify.get(url, { websocket: true }, async (connection, req) => {
    const client = connection.socket || connection;
    const user = req.state?.user;
    const clientIp = req.ip;

    // 1~3. 三级级联校验（规则本体与 HTTP 共用 checkGuardBase）
    //
    // ⚠️ 这里**只按配置树判**，不再额外跑一遍路由选项（旧实现有 4~7 段重复校验）。
    // 理由：`registerApiMetadata` 已把 requireLogin / allowRoles / allowIps /
    // requirePermission 原样写进 API 级节点，再按路由选项判一次等于"同一套值判两遍"；
    // 更麻烦的是两边语义会分叉 —— 配置树允许运维按签名放宽，而路由选项是代码硬值，
    // 于是"DB 放宽了 requireLogin"对 HTTP 生效、对 WS 不生效。

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
  // 签名声明自检（约定测试用）：requireSignature 只在 /oauth2.1 内有执行者
  hasSignatureExecutor,
  // 仅供测试直接驱动守卫核心逻辑。前缀 `__test__` 明示"非公开 API"，
  // 生产代码不应调用 —— 正常路径是经 createGuard 生成的 preHandler。
  applyGuardLogic as __test__applyGuardLogic,
  // HTTP 与 WS 必须走同一份规则实现（历史教训：曾各写一份，判据一度分叉）
  checkGuardBase as __test__checkGuardBase
};
