/**
 * 全局异常捕获 → 统一走日志系统
 *
 * 在应用入口（app.js）调用 initLogErrorTraps() 一次即可（幂等，重复调用返回同一个
 * 卸载句柄）。返回的 `uninstall()` 供测试或热重载场景摘钩 —— 不摘掉的话，同一进程里
 * 再想验证"未装钩子时的行为"就只能去数 process.listeners()。
 *
 * - uncaughtException：log.fatal 留档（文件通道本就用 appendFileSync，天然同步）→
 *   等 stderr 真正 flush 完 → process.exit(1)。
 *   为什么不"立刻退出"：stdout/stderr 在管道/重定向场景（docker、pm2、CI）是异步流，
 *   立即 process.exit 会把最后一条崩溃日志留在缓冲区里一起丢掉。
 *   为什么不"盲等 100ms"：大堆栈 + 慢管道时不够，TTY 下又白等；而且当年为了兜底
 *   还额外同步裸写一份 stderr，结果**同一份堆栈打了两遍**（格式化一条 + 裸写一条，
 *   2026-11 修掉）。现在改用 `process.stderr.write('', cb)` 作 flush 屏障：空写排在
 *   已入队内容之后，回调触发就代表前面的文字已经落到 fd 上；EXIT_FLUSH_MS 只作为
 *   "stderr 已坏、回调不来"时的兜底上限。
 * - unhandledRejection：用 always.error 记录（不受 LOG_LEVEL 门控，避免生产
 *   LOG_LEVEL=fatal 时被吞掉），不退出进程。
 *
 * 注意：安装 unhandledRejection 处理器会改变 Node ≥15 的默认行为
 * （默认模式 throw 会崩溃，安装处理器后进程继续运行）。
 *
 * 落盘策略：进程级致命日志**必须留档**，因此本模块的 logger 显式开启文件通道
 * （file.level: 'all'），不受全局 file 开关影响 —— 崩溃原因丢了对排查是灾难。
 *
 * @author yijiu2025
 * @since 2026-09-10
 */
import fs from 'node:fs';
import process from 'node:process';
// 经同目录适配层导入（而非直接 import 'wb-logkit'）：与全项目"统一走 framework/log"
// 的约定一致，也避免独立部署时依赖 packages/log 的软链存在
import { AppLogger, getLogConfig } from './index.js';

const log = new AppLogger('process');
// 进程级异常强制留档：不与全局 file 开关耦合（全局默认关闭文件，但崩溃日志不能丢）
log.config({ file: { name: 'process', level: 'all', error: true } });

/** 崩溃日志文案（改措辞只改这里） */
const MSG = {
  uncaught: '未捕获异常，进程即将退出',
  rejection: '未处理的 Promise 拒绝'
};

/** 退出码：非 0 才会被 docker / systemd / pm2 判定为异常退出 */
const EXIT_CODE = 1;

/** stderr flush 屏障的兜底上限（毫秒）：仅在 stderr 已坏、write 回调不触发时生效 */
const EXIT_FLUSH_MS = 100;

/** 已安装的卸载句柄（null = 未安装），同时充当幂等标记 */
let uninstall = null;

/**
 * 同步直写 fd 2（绕过 stream 缓冲）。
 *
 * 只在**控制台通道被关掉**时用于"至少留一行崩溃现场"。正常路径不写 —— 日志库已经
 * 把格式化后的记录写进 stderr 了，再裸写一份就是同一份堆栈打印两遍（历史事故）。
 *
 * @param {string} line - 已带换行的整行文本
 * @returns {boolean} true = 写入成功；false = fd 2 不可写（已关闭 / EPIPE），放弃
 */
function writeStderrSync(line) {
  try {
    fs.writeSync(2, line);
    return true;
  } catch {
    return false;
  }
}

/**
 * 等 stderr 里的崩溃记录落地后退出进程（只会退一次）。
 *
 * 屏障写法：`process.stderr.write('', cb)` 的空写排在已入队数据之后，`cb` 触发即代表
 * 之前那条 fatal 已经 flush 到 fd。stderr 被关闭 / EPIPE 时回调可能永不到来，因此保留
 * 一个定时器兜底。
 *
 * @returns {void}
 */
function exitAfterStderrFlush() {
  let exited = false;
  const exit = () => {
    if (exited) return;
    exited = true;
    process.exit(EXIT_CODE);
  };
  // 兜底定时器刻意 **不 unref**：unref 后若事件循环恰好空转，Node 会以 0 退出，
  // 崩溃就被记成"正常结束"了
  setTimeout(exit, EXIT_FLUSH_MS);
  try {
    process.stderr.write('', exit);
  } catch {
    exit();
  }
}

/**
 * uncaughtException 处理：留档 → 保证 stderr 可见 → flush 后退出。
 *
 * @param {unknown} err - 抛出的值（通常是 Error，`throw '字符串'` 时是任意值）
 * @returns {void}
 */
function onUncaughtException(err) {
  if (err instanceof Error) {
    log.fatal(MSG.uncaught, err);
  } else {
    // 非 Error 的抛出值没有 stack，原值走 data.thrown，别 String() 成一句没法检索的话
    log.fatal(MSG.uncaught, { thrown: err });
  }

  // 控制台通道关闭（LOG_CONSOLE=false / configureLog({ console: false })）时日志库
  // 不会往 stderr 写任何东西，此时同步补一行，避免容器里"进程没了、日志也没有"。
  // 这里判全局 consoleEnabled 就够：本 logger 带实例配置（上面的 file），按库里
  // logger.js 的解析顺序 `inst.console ?? 模块规则 ?? cfg.consoleEnabled`，模块规则
  // （LOG_CONSOLE_PROCESS 之类）对它本就不生效。
  if (!getLogConfig().consoleEnabled) {
    const detail = err instanceof Error ? err.stack : String(err);
    writeStderrSync(`[process] FATAL ${MSG.uncaught}: ${detail}\n`);
  }

  exitAfterStderrFlush();
}

/**
 * unhandledRejection 处理：记账，进程继续运行。
 *
 * 非 Error 的拒绝值走 `data.reason` 保留原值：曾用 `new Error(String(reason))` 归一化，
 * 结果 stack 指向本文件，真正的抛出位置彻底丢失（查日志只看到 traps.js:xx）。
 *
 * @param {unknown} reason - 拒绝值（Error 或任意值）
 * @returns {void}
 */
function onUnhandledRejection(reason) {
  if (reason instanceof Error) {
    log.always.error(MSG.rejection, reason);
  } else {
    log.always.error(MSG.rejection, { reason });
  }
}

/**
 * 安装全局异常捕获钩子（幂等）。
 * 在应用入口（app.js）调用一次即可。
 *
 * - uncaughtException → fatal（同步落盘）→ 等 stderr flush → process.exit(1)
 * - unhandledRejection → always.error（不受 LOG_LEVEL 门控），进程继续运行
 *
 * 注意：安装 unhandledRejection 处理器会改变 Node ≥15 的默认崩溃语义
 * （默认模式未处理的拒绝会崩溃，安装后进程继续运行）。
 *
 * @returns {function(): void} 卸载函数：摘掉两个钩子并复位幂等标记（重复调用安全）
 * @example
 *   const uninstall = initLogErrorTraps();
 *   afterAll(() => uninstall());
 */
function initLogErrorTraps() {
  if (uninstall) return uninstall;

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  uninstall = () => {
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
    uninstall = null;
  };
  return uninstall;
}

export { initLogErrorTraps };
