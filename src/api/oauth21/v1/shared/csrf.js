/**
 * CSRF 保护中间件
 *
 * 基于 Double Submit Cookie 模式：
 * 1. 服务端设置 CSRF Cookie（非 HttpOnly，前端可读取）
 * 2. 前端从 Cookie 读取 token，放入请求头 X-CSRF-Token
 * 3. 服务端校验 Cookie 和 Header 中的 token 是否一致
 */

import crypto from 'crypto';

const CSRF_COOKIE = '_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * 生成 CSRF Token
 */
function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * 注册 CSRF 保护
 * @param {object} fastify - Fastify 实例
 * @param {object} opts - 选项
 * @param {string[]} opts.exclude - 排除的路径前缀（如公开接口）
 */
export function registerCsrfProtection(fastify, opts = {}) {
  const exclude = opts.exclude || [];

  fastify.addHook('onRequest', async (request, reply) => {
    // 安全方法不需要 CSRF 校验
    if (SAFE_METHODS.includes(request.method)) return;

    // 排除路径
    if (exclude.some(p => request.url.startsWith(p))) return;

    // 读取 Cookie 中的 CSRF token
    const cookieToken = request.cookies[CSRF_COOKIE];
    // 读取 Header 中的 CSRF token
    const headerToken = request.headers[CSRF_HEADER];

    // 首次访问：设置 CSRF Cookie
    if (!cookieToken) {
      const newToken = generateToken();
      reply.setCookie(CSRF_COOKIE, newToken, {
        path: '/',
        httpOnly: false, // 前端需要读取
        sameSite: 'strict',
        maxAge: 86400 // 24 小时
      });
      // 首次请求放行（前端还没拿到 token）
      return;
    }

    // 校验 Header 和 Cookie 一致
    if (!headerToken || headerToken !== cookieToken) {
      return reply.code(403).send({
        code: 403,
        message: 'CSRF token 无效',
        data: null
      });
    }
  });
}
