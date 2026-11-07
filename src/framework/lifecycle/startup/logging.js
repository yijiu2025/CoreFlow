/**
 * 日志引导（全项目唯一的全局 configureLog 调用点）
 *
 * 从 `src/app.js` 抽出（2026-11-07）。抽出后入口只剩一行 `bootstrapLogging()`，
 * 但"只能调一次""必须在注册全局 log 之前"这两条约束仍然成立 —— 它们由本函数
 * 内部的固定顺序保证，不再依赖调用方记得顺序。
 *
 * 设计约定：
 *   ① 文件通道默认关闭 —— 不写 file 就只输出控制台，不会产生任何日志文件
 *   ② 要落盘时把下面 file 的注释打开（或直接设 LOG_FILE=true 用环境变量兜底）
 *   ③ 控制台与文件级别互相独立：控制台可以安静，文件照样记全量
 *   ④ 模块如需自己的文件，在模块内 log.config({ file: {...} }) 覆盖（不会重复写）
 *
 * 环境变量可覆盖此处任意项：LOG_LEVEL / LOG_DEBUG / LOG_CONSOLE_LEVEL / LOG_FILE ...
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { configureLog, createLogger, initLogErrorTraps } from '../../support/log/index.js';

/** 幂等保护：重复调用不再重配（热改配置请走 configureLog / log.config，本函数只负责首次引导） */
let entryLogger = null;

/**
 * 引导全局日志系统并返回入口 logger
 *
 * 顺序不可调换：
 *   1. `configureLog` 定全局门槛（含控制台 / 文件通道级别）
 *   2. `createLogger('app', true)` 注册为**全局 log**，其他模块可直接
 *      `import { log } from '.../framework/support/log/index.js'` 使用
 *   3. `initLogErrorTraps` 兜底 uncaughtException / unhandledRejection
 *
 * @returns {ReturnType<typeof createLogger>} 入口 logger（tag = `app`）
 */
function bootstrapLogging() {
  if (!entryLogger) {
    configureLog({
      level: 'info', // 全局总门槛：info 及以上（trace/debug 另由 LOG_DEBUG 控制）
      console: true, // 控制台始终开启
      consoleLevel: 'info', // 控制台通道级别：'info' 及以上；也可用数组 ['warn','error','fatal']
      debugKeywords: process.env.LOG_DEBUG || ''

      // ── 文件通道（默认关闭；需要落盘时取消注释）──────────────────────
      // file: {
      //   name: 'app',        // 文件名（默认 app）→ app-2026-09-14.log
      //   dir: 'logs',        // 目录（默认 logs）
      //   ext: '.log',        // 扩展名
      //   suffix: '',         // 文件名后缀；'pid' = 进程号（多进程部署防行交错）
      //   date: true,         // 按天滚动；false = 单文件
      //   dateDir: false,     // 日期做子目录 logs/2026-09-14/app.log
      //   subdir: 'auto',     // 模块子目录：'auto' 按 tag 首段分类
      //   level: 'info',      // 文件通道级别：'info'（及以上）/ 'all'（全量）/ ['info','error']（白名单）
      //   error: true,        // warn+ 另写一份 error 文件
      //   keepDays: 30        // 保留天数，过期自动清理；0 = 永久
      // }
    });

    // 注册为**全局 log**：其他模块可直接 import { log } 使用（必须在配置之后）
    entryLogger = createLogger('app', true);

    // 全局异常兜底：uncaughtException / unhandledRejection 统一走日志系统
    initLogErrorTraps();
  }

  return entryLogger;
}

export { bootstrapLogging };
