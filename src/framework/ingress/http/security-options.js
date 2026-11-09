/**
 * 安全响应头与跨域策略（选项构造）
 *
 * 从 `src/app.js` 抽出（2026-11-07）。这里全是"策略形状"，没有一处注册动作，
 * 所以可以脱离 Fastify 实例直接对选项做断言（见 `src/__tests__/framework/ingress/http/security-options.test.js`）。
 *
 * 三个容易踩的点：
 *   ① **iframe 白名单与 CORS 白名单是同一套受信应用域**：posecraft / firewall / admin
 *      互相 iframe 嵌入 SSO，登录页还会被嵌。两套分开维护迟早不同步。
 *   ② **frameguard 必须关掉**：否则会与 CSP 的 `frame-ancestors` 打架，
 *      浏览器按更严的那个生效，表现为"某些嵌入突然白屏"。
 *   ③ 开发环境**禁用 CSP**：HMR 依赖内联脚本，开了会被拦成一片 404。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { isOriginAllowed } from '../../../utils/index.js';

/** 允许的请求头：H5 签名 / 设备指纹 / 验证令牌都靠自定义头传，漏一个就是整条链路 401 */
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
  'token',
  'X-Sign',
  'X-Timestamp',
  'X-Nonce',
  'x-device-id',
  'X-Device-Fp',
  'x-verify-token',
  // CSRF 双提交令牌：oauth21 前端每个写请求都会带它（`request.ts` 的拦截器）。
  // 漏了这一项不是"少一个头"，而是**整个登录链路在跨域直连时全灭**：
  // 浏览器预检直接拒绝（Request header field x-csrf-token is not allowed），
  // 请求根本发不出去，前端只看到 Network Error。
  'x-csrf-token'
];

/** 允许方法 */
const CORS_ALLOWED_METHODS = ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'];

/**
 * 允许浏览器 JS 读取的响应头
 *
 * 跨域部署时浏览器只把这里列出的头交给前端 JS：设备 ID 的两个响应头是 device-sync
 * 唯一的数据来源（cookie 是 httpOnly，JS 读不到），漏暴露等于跨域直连时
 * 设备身份同步彻底失效（前端既发不出也存不下 ID）。
 */
const CORS_EXPOSED_HEADERS = ['Content-Disposition', 'token', 'X-Request-Id', 'X-Device-Id', 'X-Device-Id-Updated'];

/**
 * 构造 helmet 选项
 *
 * @param {boolean} isProduction - 是否生产环境（决定 CSP / HSTS 是否启用）
 * @param {string[]} [trustedOrigins] - 受信应用域（= CORS 白名单），用于 CSP 的
 *   `connect-src` / `frame-src` / `frame-ancestors`；空数组时按"不嵌不被嵌"处理
 * @returns {Record<string, unknown>} `@fastify/helmet` 选项
 */
function buildHelmetOptions(isProduction, trustedOrigins = []) {
  const origins = Array.isArray(trustedOrigins) ? trustedOrigins.filter(Boolean) : [];
  const hasOrigins = origins.length > 0;

  return {
    contentSecurityPolicy: !isProduction
      ? false // 开发环境禁用 CSP 避免 HMR 资源加载因内联脚本被拦截
      : {
          directives: {
            defaultSrc: ["'self'"],
            // TODO: 迁移到 nonce 或 hash 模式，彻底关闭 unsafe-inline 以启用 XSS 防护
            // 方案：使用 @fastify/helmet 的 nonce 功能，在 onRequest 钩子中生成 nonce，
            // 注入到 reply 的 locals 中，前端模板通过 `__NONCE__` 占位符获取。
            // 参考：https://github.com/helmetjs/helmet/tree/main#content-security-policy
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", ...origins],
            // 允许 iframe 嵌入受信应用域（SSO 登录页 iframe 互嵌），白名单为空时禁用
            frameSrc: hasOrigins ? ["'self'", ...origins] : ["'self'"],
            frameAncestors: hasOrigins ? ["'self'", ...origins] : ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
          }
        },
    // frameguard：用 CSP frame-ancestors 统一控制（更现代），关闭 helmet 的 frameguard 避免冲突
    frameguard: false,
    // Helmet 默认已包含 nosniff / frameguard / xssFilter / referrerPolicy
    // 生产环境额外启用 HSTS（开发环境不需要，避免 localhost 被强制 HTTPS）
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false
  };
}

/**
 * 解析额外允许头（环境变量 `CORS_EXTRA_HEADERS`，逗号分隔）
 *
 * 为什么需要这个口子：`CORS_ALLOWED_HEADERS` 是硬编码清单，**任何前端新增一个自定义头
 * 都会重演「整条链路无声全灭」**（预检直接拒绝，前端只看到 Network Error，
 * 2026-11-09 的 `x-csrf-token` 事故即此）。给它一个**只增不减**的扩展位，
 * 部署方补头不必改代码、也不必等发版。
 *
 * 安全默认不变：不配置时返回值与硬编码清单**完全一致**（不放开任何头）。
 * 与基础清单重复的头（大小写不敏感）会被跳过，避免 `allow-headers` 出现重复项。
 *
 * @param {string} [raw=''] 逗号分隔的头名
 * @returns {string[]} 需要追加的头名（去重后）
 */
function parseExtraHeaders(raw = '') {
  const base = CORS_ALLOWED_HEADERS.map(h => h.toLowerCase());
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const name = part.trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    // 头名只允许 token 字符：README 里写的示例被人连同标点一起粘进环境变量时不该生效
    if (!/^[a-z0-9-]+$/.test(lower)) continue;
    if (base.includes(lower)) continue;
    if (out.some(h => h.toLowerCase() === lower)) continue;
    out.push(name);
  }
  return out;
}

/**
 * 构造 CORS 选项
 *
 * @param {object} params
 * @param {string[]} params.origins - 白名单来源（生产环境必须非空，否则全部跨域被拒）
 * @param {boolean} params.isProduction - 是否生产环境
 * @param {string} [params.extraHeaders=''] - 额外允许头（来自 `CORS_EXTRA_HEADERS`，逗号分隔）
 * @returns {Record<string, unknown>} `@fastify/cors` 选项
 */
function buildCorsOptions({ origins = [], isProduction = false, extraHeaders = '' } = {}) {
  const allowedHeaders = [...CORS_ALLOWED_HEADERS, ...parseExtraHeaders(extraHeaders)];
  return {
    origin: (origin, cb) => {
      // origin 为 undefined 时是同源请求（无跨域），无需校验直接放行
      if (isOriginAllowed(origin, origins, isProduction)) return cb(null, true);
      return cb(new Error('CORS origin not allowed'), false);
    },
    credentials: true,
    methods: CORS_ALLOWED_METHODS,
    allowedHeaders,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    maxAge: 86400
  };
}

export {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_EXPOSED_HEADERS,
  parseExtraHeaders,
  buildHelmetOptions,
  buildCorsOptions
};
