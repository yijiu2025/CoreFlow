/**
 * 认证系统加载器
 * 注册独立 auth 插件（Session 验证 + ALS + app.auth 装饰）
 * 调用链：engine.js → 04-auth.js → src/auth/index.js
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import initAuth from '../../../security/auth/index.js';
import { registerSessionLogSink } from '../../../security/auth/audit/session-log-sink.js';
import { C } from '../../../../utils/index.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.loader.registry.04-auth');

const authLoader = async app => {
  /*
   * 会话事件订阅：登录 / 登出 / 踢出 → `session_logs`
   *
   * 必须在注册 auth 插件之前挂上：插件之后就是请求期，第一个登录不应该被漏记。
   * 🔴 这里曾**一个订阅者都没有**（事件总线空转）—— 后台「登录日志」页从 2026-11-13
   *    起再没有任何新记录，代码却"明明 emit 了"。订阅方跟着认证装配走，才不会再丢。
   */
  registerSessionLogSink();
  await app.register(initAuth);
  log.always(`✅ [Auth] ${C.green}认证系统初始化完成${C.reset}`);
};

export default authLoader;
