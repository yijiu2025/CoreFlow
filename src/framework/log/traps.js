/**
 * 全局异常捕获 → 统一走日志系统
 *
 * 在应用入口（app.js）调用 initLogErrorTraps() 一次即可。
 * - uncaughtException：记录 fatal（文件通道同步落盘）后退出。注意 stdout/stderr
 *   在管道/重定向场景（docker、pm2、CI）是异步写，立即 process.exit 会丢失
 *   控制台上的最后一条日志，因此先用 fs.writeSync 直写 fd 2 兜底，再留出
 *   刷新窗口后退出。
 * - unhandledRejection：用 always.error 记录（不受 LOG_LEVEL 门控，避免生产
 *   LOG_LEVEL=fatal 时被吞掉），不退出进程。
 *
 * 注意：安装 unhandledRejection 处理器会改变 Node ≥15 的默认行为
 * （默认模式 throw 会崩溃，安装处理器后进程继续运行）。
 *
 * @author yijiu2025
 * @since 2026-09-10
 */
import fs from 'node:fs';
import process from 'node:process';
import { AppLogger } from 'wb-logkit';

const log = new AppLogger('process');

/** 退出前留给 stdout/stderr 异步流的刷新窗口（毫秒） */
const EXIT_FLUSH_MS = 100;

let installed = false;

export function initLogErrorTraps() {
  if (installed) return;
  installed = true;

  process.on('uncaughtException', err => {
    log.fatal('未捕获异常，进程即将退出', err);
    // fatal 已同步落盘；控制台通道可能是异步流，用同步 fd 写兜底防止最后一条丢失
    try {
      fs.writeSync(2, `[process] FATAL 未捕获异常: ${err?.stack ?? err}\n`);
    } catch {
      // fd 2 不可写（如被关闭）：放弃
    }
    setTimeout(() => process.exit(1), EXIT_FLUSH_MS);
  });

  process.on('unhandledRejection', reason => {
    log.always.error('未处理的 Promise 拒绝', reason instanceof Error ? reason : new Error(String(reason)));
  });
}
