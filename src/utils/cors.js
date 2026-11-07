/**
 * CORS 来源白名单工具
 *
 * 只做两件纯判断，**不含 Fastify 相关形态**：
 *   1. 把 `CORS_ORIGINS` 环境变量解析成数组（启动时解析一次，避免逐请求解析）
 *   2. 判断某个 `Origin` 是否放行
 *
 * 为什么把判断留在 utils 而不是直接写进 `@fastify/cors` 的 `origin` 回调：
 * 这条判据是生产环境的 CSRF / 信息泄露边界，一旦写进回调就只能靠整机启动才能驱动验证。
 * 抽成纯函数后，`src/__tests__/utils/cors.test.js` 可以逐条钉住「白名单为空」「不在名单内」
 * 「同源请求（origin 为 undefined）」三种情形。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

/**
 * 解析逗号分隔的来源列表
 *
 * @param {string|undefined|null} raw - `CORS_ORIGINS` 原始值
 * @returns {string[]} 去空白、去空项后的来源列表；未配置时为空数组
 */
function parseOriginList(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return [];

  return text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 判断请求来源是否放行
 *
 * 规则：
 *   - `origin` 为空：同源请求（或非浏览器客户端），无跨域语义，放行；
 *   - 非生产环境：放行（本地开发允许任意端口的前端直连）；
 *   - 生产环境：必须命中白名单；白名单为空时**全部拒绝**（宁可不跨域，不可放开跨域）。
 *
 * @param {string|undefined|null} origin - 请求的 `Origin` 头
 * @param {string[]} allowedOrigins - 允许的来源列表
 * @param {boolean} isProduction - 是否生产环境
 * @returns {boolean} true = 放行
 */
function isOriginAllowed(origin, allowedOrigins, isProduction) {
  if (!origin) return true;
  if (!isProduction) return true;
  return Array.isArray(allowedOrigins) && allowedOrigins.includes(origin);
}

export { parseOriginList, isOriginAllowed };
