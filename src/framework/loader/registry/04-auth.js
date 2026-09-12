/**
 * 认证系统加载器
 * 注册独立 auth 插件（Session 验证 + ALS + app.auth 装饰）
 * 调用链：engine.js → 04-auth.js → src/auth/index.js
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import initAuth from '../../auth/index.js';
import { C } from '../../../utils/colors.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.loader.registry.04-auth');

export default async app => {
  await app.register(initAuth);
  log.always(`✅ [Auth] ${C.green}认证系统初始化完成${C.reset}`);
};
