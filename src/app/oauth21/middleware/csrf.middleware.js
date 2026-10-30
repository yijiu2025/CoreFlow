/**
 * CSRF 保护中间件（Double Submit Cookie）
 *
 * 1. 服务端下发 `_csrf` cookie（`HttpOnly=false`，前端要读得到）
 * 2. 前端在**非安全方法**请求里回传 `x-csrf-token`，值必须与 cookie 相同
 * 3. 服务端用 `timingSafeEqual` 比较两者
 *
 * 🔴 作用域限定在 `/oauth2.1`（与 H5 签名中间件同一条边界）
 *
 * 为什么必须走 `fp` + `rootPlugins`：应用 `init` 由 loader 以 `app.register(init)` 调用，
 * 运行在**封装子作用域**里，`init` 内 `addHook` 覆盖不到 08-api 已注册在根作用域的业务路由
 * —— 也就是说过去这份 CSRF「注册了但从未生效」。根作用域才能作用到真实路由。
 *
 * 🔴 与旧实现的差别（旧版等于没防护）
 *
 * - 旧版**没有作用域闸门**，`/auth/v1/bind-session` 之类都能被它 403；
 * - 旧版「没有 cookie 就放行」——攻击者构造的跨站表单恰好没有 cookie，等于直接放行。
 *   现在：安全方法负责**签发**，非安全方法**没有 cookie 一律 403**；
 * - 旧版只对"首个非安全请求"下发 cookie，前端永远赶不上把 token 带上；
 *   现在任何 `GET`（含 `/oauth2.1/csrf` 引导端点）都会把 cookie 铺好。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-10-30 提到根作用域 + 前缀闸门 + 严格 double-submit（U21）
 */
import crypto from 'node:crypto';
import fp from 'fastify-plugin';
import { COOKIE_POLICY } from '../../../framework/auth/cookie.js';

/** 作用域前缀（`/oauth2.10` 不误命中） */
const OAUTH21_SCOPE_PREFIX = '/oauth2.1';

/** CSRF cookie 名（前端读它） */
const CSRF_COOKIE = '_csrf';

/** CSRF 请求头名（小写，Fastify 已归一化） */
const CSRF_HEADER = 'x-csrf-token';

/** 安全方法：不改变服务端状态，只负责签发 token */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 引导端点：前端拿不到 cookie 时主动来取一次 */
const BOOTSTRAP_PATH = `${OAUTH21_SCOPE_PREFIX}/csrf`;

/** token 长度（hex 字符数） */
const TOKEN_BYTES = 24;

/** cookie 有效期（秒） */
const COOKIE_MAX_AGE = 86400;

/** 请求是否属于 oauth21 作用域 */
function isOAuth21Request(url = '') {
  const pathname = url.split('?')[0];
  return pathname === OAUTH21_SCOPE_PREFIX || pathname.startsWith(`${OAUTH21_SCOPE_PREFIX}/`);
}

/** 生成 token */
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * CSRF cookie 选项
 *
 * `sameSite` / `secure` / `domain` 一律跟随 `COOKIE_POLICY`（会话 cookie 的同一出口）：
 * 跨站部署时 `COOKIE_SAMESITE=none` 会把两者一起切过去，不会出现「会话能带、CSRF 带不上」
 * 的死局。`path: '/'` 是因为登录页在根路径，收窄会让前端读不到。
 */
function csrfCookieOptions() {
  const opts = {
    path: '/',
    httpOnly: false,
    sameSite: COOKIE_POLICY.sameSite,
    secure: COOKIE_POLICY.secure,
    maxAge: COOKIE_MAX_AGE
  };
  if (COOKIE_POLICY.domain) opts.domain = COOKIE_POLICY.domain;
  return opts;
}

/** 定长时间比较（长度不同直接判否，避免 `timingSafeEqual` 抛错） */
function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 创建 CSRF 保护插件（根作用域）
 *
 * 做成工厂而不是"插件 + 二次包装"：`app.register(fp 插件)` 必须直接拿到 fp 包装过的函数，
 * 若在外面再套一层箭头函数，钩子只会落在包装器的作用域里 —— 又变回"注册了但不生效"。
 *
 * @param {object} [opts] - 选项
 * @param {string[]} [opts.exclude] - 跳过校验的路径前缀（仍在 `/oauth2.1` 内）
 * @returns {Function} fastify 插件
 */
function createCsrfProtectionPlugin(opts = {}) {
  const exclude = opts.exclude || [];

  return fp(async function csrfProtection(app) {
    app.addHook('onRequest', async (request, reply) => {
      if (!isOAuth21Request(request.url)) return;

      const pathname = request.url.split('?')[0];
      const cookieToken = request.cookies?.[CSRF_COOKIE];

      // 安全方法：只负责签发（首次 GET 就能把 cookie 铺好，登录前不需要额外往返）
      if (SAFE_METHODS.has(request.method)) {
        if (!cookieToken) {
          const issued = generateToken();
          // 存到 request 上，引导端点复用同一枚，避免"响应里两枚 Set-Cookie"这种隐蔽不一致
          request.csrfToken = issued;
          reply.setCookie(CSRF_COOKIE, issued, csrfCookieOptions());
        }
        return;
      }

      // 客户端凭据型端点（token / revoke / device）不依赖 cookie，不能要求 double-submit
      if (exclude.some(p => pathname === p || pathname.startsWith(`${p}/`))) return;

      const headerToken = request.headers[CSRF_HEADER];
      if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
        return reply.code(403).send({
          code: 403,
          message: 'CSRF token 无效',
          data: null
        });
      }
    });

    // 引导端点：SPA 在首次登录前显式取一次 token（同时也把 cookie 铺好）
    app.get(BOOTSTRAP_PATH, async (request, reply) => {
      const existing = request.cookies?.[CSRF_COOKIE];
      if (existing) {
        return reply.send({ code: 200, message: 'ok', data: { token: existing } });
      }
      // 钩子刚签发的就复用它；否则这里补发一枚（token 与 cookie 必须同源）
      const token = request.csrfToken || generateToken();
      if (!request.csrfToken) reply.setCookie(CSRF_COOKIE, token, csrfCookieOptions());
      return reply.send({ code: 200, message: 'ok', data: { token } });
    });
  });
}

export { createCsrfProtectionPlugin, CSRF_COOKIE, CSRF_HEADER, BOOTSTRAP_PATH, isOAuth21Request };
