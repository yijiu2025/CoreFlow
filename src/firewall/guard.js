/**
 * 路由访问守卫模块
 * 提供装饰器风格的路由访问控制，支持 IP 白名单、用户白名单及登录校验。
 */
// src/firewall/guard.js

/**
 * 创建路由访问守卫
 *
 * @param {Object} options 配置项
 * @param {boolean} [options.enabled=true]     是否开放该组 API（false = 直接关闭，返回 403）
 * @param {string[]} [options.allowIps=[]]     IP 白名单（空数组 = 所有 IP 都可访问）
 * @param {string[]} [options.allowUsers=[]]   用户名白名单（空数组 = 所有登录用户都可访问）
 * @param {boolean} [options.requireLogin=false] 是否强制要求登录
 * @returns {Function} Fastify preHandler hook 函数
 *
 * @example
 * // src/api/firewall/v1/monitor.js 顶部
 * const guard = createGuard({
 *   enabled: true,
 *   allowIps: ['127.0.0.1', '192.168.1.100'],  // 只允许这些 IP
 *   allowUsers: ['admin'],                        // 或者这些用户名
 * });
 *
 * export default async function (fastify) {
 *   fastify.get('/api/v1/monitor/xxx', { preHandler: guard }, handler);
 * }
 */
/**
 * 高性能 IP 匹配引擎
 */
/**
 * IP 匹配逻辑
 * 支持精确匹配、通配符（*）及 CIDR 网段（/24）。
 * @param {string} clientIp 客户端 IP
 * @param {string} rule 匹配规则
 * @returns {boolean} 是否匹配成功
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
    } catch (e) {
      return false;
    }
  }

  return false;
}

export function createGuard(options = {}) {
  const { enabled = true, allowIps = [], allowUsers = [], requireLogin = false } = options;

  return async function guardHook(request, reply) {
    const startTime = performance.now();

    // 1. 整组 API 关闭
    if (!enabled) {
      return reply.result.forbidden('该接口已关闭');
    }

    const clientIp = request.ip;
    const user = request.state?.user;

    // 2. IP 白名单校验（配置了白名单才生效）
    if (allowIps.length > 0) {
      const ipAllowed = allowIps.some((rule) => isIpMatch(clientIp, rule));
      if (!ipAllowed) {
        request.log.warn({ ip: clientIp }, '[Guard] IP 不在白名单，访问被拒绝');
        return reply.result.forbidden('访问被拒绝：IP 不在允许范围内');
      }
    }

    // 3. 用户名白名单校验
    if (allowUsers.length > 0) {
      if (!user) {
        return reply.result.unauth('请先登录');
      }
      if (!allowUsers.includes(user.username)) {
        request.log.warn({ uid: user.uid, username: user.username }, '[Guard] 用户不在白名单');
        return reply.result.forbidden('权限不足');
      }
    }

    // 4. 强制登录校验
    if (requireLogin && !user) {
      return reply.result.unauth('请先登录');
    }

    // 统计耗时并打印日志
    const duration = (performance.now() - startTime).toFixed(3);
    request.log.info({ duration: `${duration}ms` }, `🛡️  [Firewall] 校验通过 | 耗时: ${duration}ms`);
  };
}
