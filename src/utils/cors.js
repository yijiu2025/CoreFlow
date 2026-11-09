/**
 * CORS 来源白名单工具
 *
 * 只做三件纯判断，**不含 Fastify 相关形态**：
 *   1. 把 `CORS_ORIGINS` 环境变量解析成数组（启动时解析一次，避免逐请求解析）
 *   2. 归一化来源（去空白 / 去尾斜杠 / 小写）
 *   3. 判断某个 `Origin` 是否放行
 *
 * 为什么把判断留在 utils 而不是直接写进 `@fastify/cors` 的 `origin` 回调：
 * 这条判据是生产环境的 CSRF / 信息泄露边界，一旦写进回调就只能靠整机启动才能驱动验证。
 * 抽成纯函数后，`src/__tests__/utils/cors.test.js` 可以逐条钉住「白名单为空」「不在名单内」
 * 「同源请求（origin 为 undefined）」三种情形。
 *
 * 为什么归一化必须在这里做（2026-11-09）：`origin-guard.js` 一直按「去尾斜杠 + 小写」
 * 比对白名单，而本文件原样 `includes` —— 于是配置里写 `https://A.com/` 时，
 * 跨域请求被 `@fastify/cors` 拒绝、敏感端点却被 origin-guard 放行，两边判据各说一套。
 * 现在两边共用 `normalizeOrigin`，口径只此一处。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { parseCsvList } from './strings.js';

/**
 * 归一化一个来源
 *
 * 浏览器发来的 `Origin` 头永远是 `scheme://host[:port]` 形态（scheme/host 小写、无尾斜杠），
 * 而环境变量是人写的：`https://A.com/`、` https://a.com ` 都很常见。
 *
 * @param {string|undefined|null} value
 * @returns {string} 归一化后的来源；非字符串返回空串
 */
function normalizeOrigin(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * 解析逗号分隔的来源列表
 *
 * 归一化 + 去重：同一条白名单写两遍（大小写/尾斜杠不同）不会造成重复比对，
 * 也让 `trustedOrigins` 直接进 CSP `frame-ancestors` 时不会出现重复项。
 *
 * @param {string|undefined|null} raw - `CORS_ORIGINS` 原始值
 * @returns {string[]} 归一化、去空白、去重后的来源列表；未配置时为空数组
 */
function parseOriginList(raw) {
  const list = parseCsvList(raw).map(normalizeOrigin).filter(Boolean);
  return [...new Set(list)];
}

/**
 * 判断请求来源是否放行
 *
 * 规则：
 *   - `origin` 为空：同源请求（或非浏览器客户端），无跨域语义，放行；
 *   - 非生产环境：放行（本地开发允许任意端口的前端直连）；
 *   - 生产环境：必须命中白名单；白名单为空时**全部拒绝**（宁可不跨域，不可放开跨域）；
 *   - 无法归一化的 origin（非字符串 / 只有空白）一律拒绝 —— fail-closed。
 *
 * @param {string|undefined|null} origin - 请求的 `Origin` 头
 * @param {string[]} allowedOrigins - 允许的来源列表
 * @param {boolean} isProduction - 是否生产环境
 * @returns {boolean} true = 放行
 */
function isOriginAllowed(origin, allowedOrigins, isProduction) {
  if (!origin) return true;
  if (!isProduction) return true;
  if (!Array.isArray(allowedOrigins)) return false;

  const target = normalizeOrigin(origin);
  if (!target) return false;

  return allowedOrigins.some(allowed => normalizeOrigin(allowed) === target);
}

export { normalizeOrigin, parseOriginList, isOriginAllowed };
