// src/auth/index.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { als } from './als.js';
import { xToken } from './xToken.js';
import fp from 'fastify-plugin';

export const initAuth = fp(async function (app) {
  // 挂载 auth 工具到 app 实例（无状态工具集，挂 app 比挂 request 更合理）
  app.decorate('auth', xToken);

  // 1. 初始化 request.state（Fastify 无内置 state，必须显式装饰）
  //    在 onRequest hook 内初始化，而非 decorateRequest，避免跨请求引用共享
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
    als.run(ctxAdapter, done);
  });

  // 2. 多端自适应身份识别 (preHandler Hook)
  app.addHook('preHandler', async (request, reply) => {
    // 使用独立变量区分凭证来源，消除 'is_session' 魔法字符串
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
    if (!authSource) return;

    try {
      let user = null;

      if (authSource === 'session') {
        // Session 登录直接取 user
        user = request.session.user;
      } else {
        // JWT 校验
        user = jwt.verify(rawToken, process.env.JWT_SECRET);

        // ✅ 黑名单 Key 使用 SHA-256 摘要，而非完整 JWT (节省约 70% Redis 内存)
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const redis = request.server.redis;

        if (redis) {
          try {
            const isBlacklisted = await redis.get(`blacklist:token:${tokenHash}`);
            if (isBlacklisted) {
              // ✅ 黑名单失效：不再强制中断，而是标记为过期并置空放行
              user = null;
              reply.header('X-Auth-Status', 'expired');
              reply.clearCookie('token');
            }
          } catch (redisErr) {
            // ✅ Redis 故障时显式记录日志，而非静默跳过（安全降级：放行 + 记录）
            request.log.warn({ err: redisErr }, '[Auth] Redis 黑名单检查失败，已降级放行');
          }
        }
      }

      // 只写一处 request.state，ALS 中的 ctx.state 因为是同一引用，自动同步
      request.state.user = user;
    } catch (err) {
      // ✅ 区分"过期"与"非法凭证"，不再一律静默吞掉
      if (err.name === 'TokenExpiredError') {
        // Token 过期：通知前端踢人，并清除 Cookie
        reply.header('X-Auth-Status', 'expired');
        reply.clearCookie('token');
      } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
        // 畸形或未生效的 Token：明确拒绝，阻止探测攻击
        return reply.code(401).send({ success: false, message: '无效凭证' });
      }
      // 其他未知错误继续向上抛出，由全局 Error Handler 处理
      // request.state.user 保持 undefined，由后续权限守卫拦截
    }
  });
});
