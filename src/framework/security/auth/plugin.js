/**
 * 认证插件装配
 *
 * Fastify 插件本体：onRequest 认证主流程（JWT → Session → 风险检测）、
 * ALS 请求包裹、onSend 风险注入、StpUtil 装饰。
 * 各职责的实现分别在 bearer-auth.js / risk/risk-hooks.js / context/accessors.js，
 * 本文件只做钩子接线。由 auth/index.js 作为门面对外默认导出。
 *
 * 核心职责：
 * 1. ALS (AsyncLocalStorage) 上下文初始化，实现请求级别的上下文穿透
 * 2. Session Cookie 验证 → request.state.user（主要认证方式）
 * 3. Bearer Token / access_token Cookie 验证 → request.state.user（OAuth 2.1 兼容）
 * 4. sid 过期时用 sid_r 自动刷新（双令牌续期机制）
 *
 * 认证优先级：Bearer Token > access_token Cookie > Session Cookie (sid) > Refresh Token (sid_r)
 *
 * @author yijiu
 * @since 2026-07-13
 * @since 2026-11-01 自 auth/index.js 拆出（index.js 收敛为纯门面）
 */
import fp from 'fastify-plugin';
import { requestContext } from './context/request-context.js';
import { getSession } from './session/session.js';
import { COOKIE_SID } from './context/cookie.js';
import StpUtil from './context/stp-util.js';
import { authenticateByJwt } from './bearer-auth.js';
import { detectAndHandleRisk, injectRiskOnSend } from './risk/risk-hooks.js';
import { setLogContextProvider } from '../../support/log/index.js';

// ── 日志上下文注册（framework/log 不反向依赖 auth，避免循环）──
// 模块级副作用：与拆分前 index.js 的行为一致（import 即注册）。
setLogContextProvider(() => {
  const req = requestContext.getStore();
  if (!req) return {};
  return {
    requestId: req.id,
    userId: req.state?.user?.userId
  };
});

// requestContext 实例定义在 context/request-context.js（零依赖）。
// 曾在插件文件直接 new AsyncLocalStorage()，导致 StpUtil.js 必须反向 import →
// 循环依赖 + 连带拉起整条插件链（docs/AUDIT-REPORT-2026-09-12.md 🟡-1）。

const authPlugin = fp(async app => {
  // onRequest：认证主流程
  // 注意：认证钩子不依赖 ALS（用 request 参数直传），故先注册无碍。
  // ALS 钩子在后注册，其 requestContext.run 的 store 在 done() 后的异步延续里
  // 仍可供 preHandler/handler 阶段的 getCtx()/getDb()/getServerResource() 取用。
  app.addHook('onRequest', async (request, reply) => {
    // 1. 初始化 request.state
    if (!request.state) request.state = {};

    const cookies = request.cookies || {};

    // 2. JWT 认证（仅在 JWT_ENABLED=true 时启用）
    const jwtUser = await authenticateByJwt(cookies, request.headers);
    if (jwtUser) {
      request.state.user = jwtUser;
      return;
    }

    // 3. Session Cookie 验证（sid）— 主要认证方式
    let sessionData = null;

    // 尝试用 sid 获取 session（同时递增访问次数）
    if (cookies[COOKIE_SID]) {
      sessionData = await getSession({ cookies, reply });
    }

    // 写入 request.state.user + 风险检测
    if (sessionData) {
      request.state.user = {
        sub: sessionData.uid,
        uid: sessionData.uid,
        userId: sessionData.userId,
        username: sessionData.username,
        email: sessionData.email,
        avatar: sessionData.avatar,
        status: sessionData.status,
        appId: sessionData.appId,
        roles: sessionData.roles,
        permissions: sessionData.permissions,
        sessionId: sessionData.sessionId
      };

      // 访问时风险检测（基准从 Redis sessionData 取，不查 DB）
      await detectAndHandleRisk(request, reply, sessionData);
    }
  });

  // ALS 包裹每个请求
  app.addHook('onRequest', (request, reply, done) => {
    requestContext.run(request, () => {
      done();
    });
  });

  // onSend：info 级风险注入响应体（不阻断读操作）
  app.addHook('onSend', injectRiskOnSend);

  // 挂载 StpUtil 到 app
  app.decorate('auth', StpUtil);
});

export default authPlugin;
