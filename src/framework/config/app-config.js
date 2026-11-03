/**
 * 应用级调优覆盖（**惰性可缺**）
 *
 * `src/config/app_config.js` 是可选覆盖层：文件缺失 / 导出缺失 / 语法错误 →
 * 本模块导出的 APP_CONFIG 为 `{}`，各消费方用**自己写在使用处的保底值**继续跑：
 *   - app.js            http.keepAliveTimeoutMs → 72_000；requestTimeoutMs → 300_000；
 *                       websocket.shutdownGraceMs → 1_000
 *   - guard-config.js   guard.syncIntervalMs → 30_000
 *   - 01-monitor.js     monitor.slowRequestThresholdMs → 2_000
 *   - password-hash.js  passwordHash.scryptMaxConcurrency → 16；bcrypt… → 4
 * 即「默认值归 core（使用处），src/config 只做覆盖」。
 *
 * 校验见 framework/config/app-config-schema.js（未知键 / 值域，启动时告警）。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

import { loadOverrides } from './overrides.js';

/** 静态覆盖（可选；缺失则为 {}）。一次加载，多处引用 */
const APP_CONFIG = loadOverrides('app_config.js', 'APP_CONFIG');

export { APP_CONFIG };
