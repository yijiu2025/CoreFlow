/**
 * framework/log — 适配层
 *
 * 日志核心已抽到独立 npm 包 `packages/log`（包名 wb-log，Node/浏览器通用，
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
 *  实例级配置（优先级最高，详见 wb-log 包 logger.js）：
 *   const log = createLogger('pay', { level: 'debug', file: { name: 'pay' } });
 *   log.config({ level: 'warn' });             // 运行时更新
 *
 *  全局编程配置：
 *   import { configureLog } from '.../framework/log/index.js';
 *   configureLog({ level: 'warn', fileName: 'server', debugKeywords: ['auth'] });
 *
 *  模块级环境变量（无需改代码）：
 *   LOG_LEVEL_AUTH=info         auth 模块最低级别
 *   LOG_CONSOLE_REDIS=off       redis 模块只写文件不进控制台
 *   LOG_FILE_CLI=false          cli 模块不写文件
 *
 * 禁止在业务代码出现任何 console.*（ESLint no-console: error 强制）。
 *
 * @author yijiu2025
 * @since 2026-09-10
 */
export * from '@qirly/wb-log';
export { default } from '@qirly/wb-log';
export { initLogErrorTraps } from './traps.js';
