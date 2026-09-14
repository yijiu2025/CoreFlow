/**
 * framework/log — 适配层
 *
 * 日志核心已抽到独立 npm 包 `packages/log`（包名 wb-logkit，Node/浏览器通用，
 * 前端可直接复用）。本文件保持既有导入路径 `framework/log/index.js` 不变，
 * 并追加服务器专属能力（全局异常钩子）。
 *
 * 快速上手：
 *   import { createLogger } from '<相对路径>/framework/log/index.js';
 *   const log = createLogger('auth.session');
 *
 *   log.info('用户登录', { userId });           // 常规日志
 *   log.error('查询失败', err);                 // 错误（自动 stack）
 *   log.debug('缓存未命中', key);               // 调试：需 LOG_DEBUG=auth 才输出
 *   log.fatal('进程级故障', err);               // 同步落盘
 *
 *  输出控制矩阵（两个正交维度，任意级别任意组合，顺序无关）：
 *   log.always.error('...')     必输（无视 LOG_LEVEL / LOG_DEBUG / 环境）
 *   log.dev.info('...')         仅开发环境（NODE_ENV !== 'production'，LOG_DEV 可覆盖）
 *   log.prod.error('...')       仅生产环境
 *   log.dev.always.info('...')  组合：仅开发 + 必输
 *   log.file.info('...')        只写文件、不刷控制台（留档）
 *
 *  ════════ 三个核心约定（本项目） ════════
 *
 *  ① 全局配置只在 app.js 调一次 configureLog()：
 *     configureLog({
 *       level: 'info',
 *       console: true,
 *       consoleLevel: 'info',            // 控制台通道级别
 *       file: {                          // ← 写文件必须显式开启（默认关闭）
 *         name: 'app', dir: 'logs', date: true,
 *         level: 'info'                  // 文件通道级别：'all' / ['info','error'] / 'info'
 *       }
 *     });
 *
 *  ② 注册全局 log（入口文件头部执行一次）：
 *     createLogger('app', true);         // 第二个参数 true = 注册为全局
 *     然后其他文件直接：import { log } from '.../framework/log/index.js';
 *     ※ createLogger 只有两个参数；所有配置一律走 config()
 *
 *  ③ 模块自己的配置（运行时随时改）：
 *     const log = createLogger('pay');
 *     log.config({
 *       level: 'info',                   // 本模块级别
 *       file: { name: 'pay', level: 'all' }  // 本模块独立文件（覆盖全局文件配置，不重复写）
 *     });
 *     log.config({ file: false });       // 本模块不写文件（只打控制台）
 *
 *  实例级 file 配置与全局的关系：**覆盖**，不是叠加 ——
 *  全局开了文件、模块又给了 file，则该模块只写自己那份（不会写两遍）
 *
 *  全局编程配置（app.js 一次性）：
 *   import { configureLog } from '.../framework/log/index.js';
 *   configureLog({ level: 'info', consoleLevel: 'warn' });
 *
 *  模块级环境变量（无需改代码）：
 *   LOG_LEVEL_AUTH=info         auth 模块最低级别
 *   LOG_CONSOLE_LEVEL=warn      控制台只打 warn+（文件不受影响）
 *   LOG_FILE=true               全局开启文件通道
 *   LOG_FILE_LEVEL=all          文件通道记全量
 *   LOG_FILE_CLI=false          cli 模块不写文件
 *
 * 禁止在业务代码出现任何 console.*（ESLint no-console: error 强制）。
 *
 * @author yijiu2025
 * @since 2026-09-10
 */
export * from 'wb-logkit';
export { default } from 'wb-logkit';
export { initLogErrorTraps } from './traps.js';
