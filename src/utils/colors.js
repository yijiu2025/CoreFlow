/**
 * 终端颜色常量
 * 用于启动日志的彩色输出，全系统统一使用
 *
 * **TTY 自适应**：非交互式终端（docker / pm2 / 重定向到文件 / CI）下，
 * 所有颜色码自动降级为空串，避免把 `\x1b[31m` 这类转义序列泄漏到日志采集端。
 * 调用方无需判断 `process.stdout.isTTY`，直接插值即可。
 *
 * **用户偏好优先**：`NO_COLOR=1` 一律关色（no-color.org 约定），`FORCE_COLOR=1` 在管道里
 * 也能强制上色（`FORCE_COLOR=0` 是显式关色）。两者都只影响颜色，不影响 `IS_TTY`。
 *
 * 为什么需要在这层做：日志库只给自己生成的**前缀**（时间/级别/标签）上色，
 * 消息体（`record.msg`）是原样拼接的，颜色由调用方负责。
 *
 * 另导出 `IS_TTY`，供**非颜色类**的终端能力判断复用（如 `chcp` 这类只有真终端
 * 才有意义的操作）。全仓的 `isTTY` 判断应只此一处，勿在别处再写一遍。
 *
 * @example
 * import { C } from '../utils/index.js';
 * log.info(`✅ [Redis] ${C.green}连接成功${C.reset}`);
 *
 * @author yijiu2025
 * @since 2026-07-13
 */

/** 是否为交互式终端（Node 且 stdout 为 TTY；浏览器/管道/CI 均为 false） */
const IS_TTY = typeof process !== 'undefined' && process.stdout?.isTTY === true;

/**
 * 环境变量开关（两个事实标准，互为反向）
 *   - `NO_COLOR`（https://no-color.org）：只要存在且非空就**关**色，用户偏好优先；
 *   - `FORCE_COLOR`：非空且不为 `'0'` 就**强制**开色（CI 里 `stdout` 是管道，
 *     但很多人仍要彩色日志；`FORCE_COLOR=0` 是"显式关闭"的写法）。
 */
const ENV = (typeof process !== 'undefined' && process.env) || {};
const NO_COLOR = typeof ENV.NO_COLOR === 'string' && ENV.NO_COLOR !== '';
const FORCE_COLOR = typeof ENV.FORCE_COLOR === 'string' && ENV.FORCE_COLOR !== '' && ENV.FORCE_COLOR !== '0';

/**
 * 是否产出颜色码：显式关色优先 → TTY → FORCE_COLOR 可强开。
 *
 * 注意与 `IS_TTY` 的区别：`IS_TTY` 表达的是"终端能力"（`chcp` 这类只有真终端才有意义的
 * 操作要用它），`NO_COLOR` 只影响**颜色**，不该让 `chcp` 跟着被跳过。
 */
const COLOR_ENABLED = !NO_COLOR && (IS_TTY || FORCE_COLOR);

/**
 * 按终端能力返回颜色码，不该上色时返回空串
 * @param {string} s - ANSI SGR 颜色码
 * @returns {string} 允许上色时返回原码；否则空串
 */
const code = s => (COLOR_ENABLED ? s : '');

const C = {
  reset: code('\x1b[0m'),
  green: code('\x1b[32m'),
  yellow: code('\x1b[33m'),
  red: code('\x1b[31m'),
  cyan: code('\x1b[36m'),
  dim: code('\x1b[2m')
};

export { C, IS_TTY };
