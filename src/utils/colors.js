/**
 * 终端颜色常量
 * 用于启动日志的彩色输出，全系统统一使用
 *
 * @example
 * import { C } from '../utils/colors.js';
 * console.log(`✅ [Redis] ${C.green}连接成功${C.reset}`);
 */
export const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};
