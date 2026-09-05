/**
 * Origin 来源校验守卫
 *
 * 为消费一次性凭证（如 session_token）的敏感端点提供来源白名单校验，
 * 防止凭证泄露后被非授权域消费（纵深防御）。
 *
 * 白名单复用 CORS_ORIGINS 环境变量（与跨域访问白名单一致，启动时解析缓存）。
 * 生产环境 fail-closed：未配置白名单或来源不在白名单内 → 拒绝。
 * 开发环境宽松：放行所有来源，便于本地跨端口调试。
 *
 * 校验顺序：Origin 头 → Referer 头的 origin（兜底同源请求）→ 拒绝。
 * 浏览器跨域请求必带 Origin；同源请求可能仅带 Referer；两者皆无视为非浏览器请求。
 *
 * @author yijiu2025
 * @since 2026-08-18
 */

/** 允许的来源白名单（复用 CORS_ORIGINS，启动时解析缓存） */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS?.trim() || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && ALLOWED_ORIGINS.length === 0) {
  console.warn('⚠️ [Auth] 生产环境未配置 CORS_ORIGINS，origin-guard 将拒绝所有敏感端点请求（fail-closed）');
}

/**
 * 判断请求来源是否在白名单内
 * @param {import('fastify').FastifyRequest} request - Fastify 请求
 * @returns {boolean} 是否允许
 */
export function isAllowedOrigin(request) {
  const origin = request?.headers?.origin;

  if (origin) {
    // 有 Origin：白名单为空时开发放行、生产拒绝；否则校验白名单
    if (ALLOWED_ORIGINS.length === 0) return !IS_PRODUCTION;
    return ALLOWED_ORIGINS.includes(origin);
  }

  // 无 Origin：同源浏览器请求可能仅带 Referer，用它兜底
  const referer = request?.headers?.referer;
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.length === 0) return !IS_PRODUCTION;
      return ALLOWED_ORIGINS.includes(refOrigin);
    } catch {
      // Referer 格式异常 → 拒绝
      return false;
    }
  }

  // 既无 Origin 又无 Referer：非浏览器请求（如 curl），开发放行生产拒绝
  return !IS_PRODUCTION;
}
