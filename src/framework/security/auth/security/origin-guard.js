import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.auth.origin-guard');
/**
 * Origin 来源校验守卫
 *
 * 为消费一次性凭证（如 session_token）的敏感端点提供来源白名单校验，
 * 防止凭证泄露后被非授权域消费（纵深防御）。
 *
 * 白名单复用 CORS_ORIGINS 环境变量（与跨域访问白名单一致，惰性解析 + 按值缓存，
 * 归一化尾斜杠与大小写后精确比对）。
 * 生产环境 fail-closed：未配置白名单或来源不在白名单内 → 拒绝。
 * 开发环境宽松：放行所有来源，便于本地跨端口调试。
 *
 * 校验顺序：Origin 头 → Referer 头的 origin（兜底同源请求）→ 拒绝。
 * 浏览器跨域请求必带 Origin；同源请求可能仅带 Referer；两者皆无视为非浏览器请求。
 *
 * @author yijiu2025
 * @since 2026-08-18
 */

/**
 * 允许的来源白名单（复用 CORS_ORIGINS）
 *
 * 惰性解析 + 按原始串缓存：env 在进程生命周期内不变时只解析一次（与启动时解析
 * 等效），但不与 import 时序耦合（测试/工具在 import 后设置 env 也能生效）。
 *
 * 🔴 归一化：env 里的尾斜杠（`https://a.com/`）与大小写都会导致精确匹配失配 ——
 * 浏览器 Origin 头与 `new URL(referer).origin` 都是 scheme/host 小写、无尾斜杠
 * 形态，白名单侧必须做同样归一化再比对。
 */
let _cachedRaw = null;
let _cachedOrigins = [];
let _warnedEmpty = false;

function allowedOrigins() {
  const raw = process.env.CORS_ORIGINS?.trim() || '';
  if (raw !== _cachedRaw) {
    _cachedRaw = raw;
    _cachedOrigins = raw
      .split(',')
      .map(s => s.trim().replace(/\/+$/, '').toLowerCase())
      .filter(Boolean);
    _warnedEmpty = false;
  }
  if (process.env.NODE_ENV === 'production' && _cachedOrigins.length === 0 && !_warnedEmpty) {
    _warnedEmpty = true;
    log.warn('⚠️ [Auth] 生产环境未配置 CORS_ORIGINS，origin-guard 将拒绝所有敏感端点请求（fail-closed）');
  }
  return _cachedOrigins;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/** 与白名单同口径归一化（Origin 头 / Referer origin 都走这里） */
function normalizeOrigin(raw) {
  return String(raw).trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * 判断请求来源是否在白名单内
 * @param {import('fastify').FastifyRequest} request - Fastify 请求
 * @returns {boolean} 是否允许
 */
function isAllowedOrigin(request) {
  const origins = allowedOrigins();
  const production = isProduction();
  const origin = request?.headers?.origin;

  if (origin) {
    // 有 Origin：白名单为空时开发放行、生产拒绝；否则校验白名单
    if (origins.length === 0) return !production;
    return origins.includes(normalizeOrigin(origin));
  }

  // 无 Origin：同源浏览器请求可能仅带 Referer，用它兜底
  const referer = request?.headers?.referer;
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (origins.length === 0) return !production;
      return origins.includes(normalizeOrigin(refOrigin));
    } catch {
      // Referer 格式异常 → 拒绝
      return false;
    }
  }

  // 既无 Origin 又无 Referer：非浏览器请求（如 curl），开发放行生产拒绝
  return !production;
}

export { isAllowedOrigin };
