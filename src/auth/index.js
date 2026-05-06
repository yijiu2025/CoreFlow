// src/auth/index.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { als } from './als.js';
import { xToken } from './xToken.js';
import fp from 'fastify-plugin';

export const initAuth = fp(async function (app) {
  // 挂载 auth 工具到 app 实例（无状态工具集，挂 app 比挂 request 更合理）
  app.decorate('auth', xToken);

  // onRequest：ALS 初始化 + 身份识别（合并为一个钩子，保证在限流之前完成）
  //    前提：@fastify/cookie 已在之前注册，request.cookies 可用
  //    认证只依赖 cookies/headers，不依赖 body，放 onRequest 完全可行
  app.addHook('onRequest', (request, reply, done) => {
    // 先在 request 上挂载 state，保证全局可访问
    request.state = {};

    // 构建兼容 Koa ctx 结构的 ctxAdapter，state 直接引用同一个对象
    // 这样 request.state.user = x 和 ctx.state.user = x 天然同步，无需手动二次写入
    const ctxAdapter = {
      request,
      reply,
      state: request.state, // ⚠️ 同一引用，不能是 {} 新对象
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

    // ✅ 使用 run() 代替 enterWith()
    // run() 为每个请求创建独立的异步上下文作用域，根除并发泄漏风险
    // enterWith() 修改当前上下文会导致高并发下同一 tick 内的请求相互污染
    als.run(ctxAdapter, async () => {
      // --- 多端自适应身份识别 ---
      let authSource = null;
      let rawToken = null;

      if (request.cookies?.token) {
        authSource = 'cookie';
        rawToken = request.cookies.token;
      } else if (request.headers.authorization?.startsWith('Bearer ')) {
        authSource = 'bearer';
        rawToken = request.headers.authorization.slice(7);
      } else if (request.headers.token) {
        authSource = 'header';
        rawToken = request.headers.token;
      } else if (request.session?.user) {
        authSource = 'session';
      }

      // 无任何凭证 → 放行，由后续权限守卫按需拦截
      if (!authSource) return done();

      try {
        let user = null;

        if (authSource === 'session') {
          user = request.session.user;
        } else {
          // JWT 校验
          user = jwt.verify(rawToken, process.env.JWT_SECRET);

          // 黑名单 Key 使用 SHA-256 摘要，节省约 70% Redis 内存
          const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          const redis = request.server.redis;

          if (redis) {
            try {
              const isBlacklisted = await redis.get(`blacklist:token:${tokenHash}`);
              if (isBlacklisted) {
                user = null;
                reply.header('X-Auth-Status', 'expired');
                reply.clearCookie('token');
              }
            } catch (redisErr) {
              // Redis 故障时降级放行并记录日志
              request.log.warn({ err: redisErr }, '[Auth] Redis 黑名单检查失败，已降级放行');
            }
          }
        }

        request.state.user = user;
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          reply.header('X-Auth-Status', 'expired');
          reply.clearCookie('token');
        } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
          return reply.code(401).send({ success: false, message: '无效凭证' });
        }
      }

      done();
    });
  });
});
