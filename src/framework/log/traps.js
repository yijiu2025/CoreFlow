/**
 * 全局异常捕获 → 统一走日志系统
 *
 * 在应用入口（app.js）调用 initLogErrorTraps() 一次即可。
 * uncaughtException 记录 fatal（同步落盘）后退出；unhandledRejection 仅记录 error 不退出。
 *
 * @author yijiu2025
 * @since 2026-09-10
 */
import process from 'node:process';
import { AppLogger } from '@qirly/wb-log';

const log = new AppLogger('process');

let installed = false;

export function initLogErrorTraps() {
  if (installed) return;
  installed = true;

  process.on('uncaughtException', err => {
    log.fatal('未捕获异常，进程即将退出', err);
    // fatal 已同步落盘，安全退出
    process.exitCode = 1;
    process.exit(1);
  });

  process.on('unhandledRejection', reason => {
    log.error('未处理的 Promise 拒绝', reason instanceof Error ? reason : new Error(String(reason)));
  });
}
