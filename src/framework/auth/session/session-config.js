/**
 * 会话策略配置访问器
 *
 * 值来自 `src/config/auth_config.js`（默认值，带注释）；
 * 运行时覆盖写在 `src/data/auth_config.json`（热改，无需重启）。
 *
 * ⚠️ 消费方必须**每次使用时调用 `authSessionConfig()`**，不要把返回值缓存成
 * 模块级常量 —— 那会退回「改完要重启」，热改语义就丢了。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

import { createRuntimeConfig } from '../../config/runtime.js';
import { AUTH_CONFIG } from '../../../config/auth_config.js';

const runtime = createRuntimeConfig({ name: 'auth', defaults: AUTH_CONFIG });

/**
 * 取当前生效的会话策略（热改：改 src/data/auth_config.json 后下一次调用即生效）
 *
 * @returns {{ rotatedRetentionSeconds: number, maxActiveDevices: number, singleDeviceTypes: string[] }}
 */
function authSessionConfig() {
  return runtime.get().session;
}

export { runtime as authRuntime, authSessionConfig };
