/**
 * OAuth 2.1 认证中间件（Fastify 插件格式）
 *
 * 参照 src/auth/index.js 的注册方式：
 * - onRequest 钩子中完成 ALS 初始化 + Token 验证
 * - 多端自适应：Cookie / Bearer / Header 三种来源
 * - 验证使用 RS256 公钥签名（OAuth 2.1 标准）
 * - request.state.user 写入解码后的 claims
 */
import fp from 'fastify-plugin';
import { als } from '../utils/als.js';
import { xToken } from '../utils/xToken.js';
import { verify } from '../crypto/jwt.js';
import { verifySignature } from '../../api/oauth21/v1/signature.js';

export const initOAuthAuth = fp(async function (app) {
  // 注册全局接口签名校验拦截器
  app.addHook('preHandler', async (request, reply) => {
    // 排除静态文件或 favicon 等非 API 请求
    if (request.url.startsWith('/assets') || request.url === '/favicon.ico') {
      return;
    }
    await verifySignature(request, reply);
  });

  // 挂载 auth 工具到 app 实例（无状态工具集，挂 app 比挂 request 更合理）
  app.decorate('auth', xToken);
  // onRequest：ALS 初始化 + 身份识别
  app.addHook('onRequest', (request, reply, done) => {
    // 初始化 request.state（如已被主 auth 初始化则复用）
    if (!request.state) request.state = {};

    // ALS 上下文适配器
    const ctxAdapter = {
      request,
      reply,
      state: request.state,
      get cookies() {
        return request.cookies;
      },
      get headers() {
        return request.headers;
      },
      throw(code, msg) {
        const err = new Error(msg);
        err.statusCode = code;
        throw err;
      }
    };

    als.run(ctxAdapter, async () => {
      // --- 多端自适应 Token 提取 ---
      let rawToken = null;

      if (request.cookies?.access_token) {
        rawToken = request.cookies.access_token;
      } else if (request.headers.authorization?.startsWith('Bearer ')) {
        rawToken = request.headers.authorization.slice(7);
      } else if (request.headers.token) {
        rawToken = request.headers.token;
      }

      // 无 Token → 放行，由后续守卫按需拦截
      if (!rawToken) return done();

      // --- RS256 公钥验证 ---
      try {
        const payload = verify(rawToken);

        // 写入 OAuth 2.1 标准 claims
        request.state.user = {
          sub: payload.sub,
          client_id: payload.client_id,
          scope: payload.scope,
          token_type: payload.token_type,
          aud: payload.aud,
          iss: payload.iss,
          exp: payload.exp,
          iat: payload.iat,
          jti: payload.jti
        };
      } catch (err) {
        request.state.authError = err;
        if (err.name === 'TokenExpiredError') {
          reply.header('X-Auth-Status', 'expired');
          try {
            reply.clearCookie('access_token');
          } catch (e) {}
        }
      }

      done();
    });
  });
});

/**
 * Scope 校验工具函数
 * 在 preHandler 中使用，检查已认证用户是否拥有指定权限范围。
 *
 * @param {...string} requiredScopes 需要的 scope 列表
 * @returns {Function} Fastify preHandler 钩子
 *
 * @example
 * app.get('/api/resource', { preHandler: checkScope('read', 'write') }, handler);
 */
export function checkScope(...requiredScopes) {
  return async function scopeGuard(request, reply) {
    const user = request.state?.user;

    if (!user?.scope) {
      return reply.code(403).send({
        error: 'insufficient_scope',
        error_description: 'No scope found in token'
      });
    }

    const userScopes = user.scope.split(' ');
    const hasAll = requiredScopes.every(s => userScopes.includes(s));

    if (!hasAll) {
      return reply.code(403).send({
        error: 'insufficient_scope',
        required: requiredScopes.join(' ')
      });
    }
  };
}
