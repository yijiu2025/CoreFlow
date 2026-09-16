/**
 * 终端颜色常量
 * 用于启动日志的彩色输出，全系统统一使用
 *
 * **TTY 自适应**：非交互式终端（docker / pm2 / 重定向到文件 / CI）下，
 * 所有颜色码自动降级为空串，避免把 `\x1b[31m` 这类转义序列泄漏到日志采集端。
 * 调用方无需判断 `process.stdout.isTTY`，直接插值即可。
 *
 * 为什么需要在这层做：日志库只给自己生成的**前缀**（时间/级别/标签）上色，
 * 消息体（`record.msg`）是原样拼接的，颜色由调用方负责。
 *
 * @example
 * import { C } from '../utils/colors.js';
 * log.info(`✅ [Redis] ${C.green}连接成功${C.reset}`);
 *
 * @author Claude
 * @since 2026-07-13
 */

/** 是否为交互式终端（Node 且 stdout 为 TTY；浏览器/管道/CI 均为 false） */
const IS_TTY = typeof process !== 'undefined' && process.stdout?.isTTY === true;

/**
 * 按 TTY 能力返回颜色码，非交互式终端返回空串
 * @param {string} code - ANSI SGR 颜色码
 * @returns {string} TTY 下返回原码；否则空串
 */
const code = s => (IS_TTY ? s : '');

const C = {
  reset: code('\x1b[0m'),
  green: code('\x1b[32m'),
  yellow: code('\x1b[33m'),
  red: code('\x1b[31m'),
  cyan: code('\x1b[36m'),
  dim: code('\x1b[2m')
};

export { C, IS_TTY };
