/**
 * 应用入口：启动 Fastify 服务并初始化所有模块
 * 按引擎加载器顺序执行：Redis → DB → Auth → Firewall → Models → API → Apps
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

/* eslint-disable no-console */

import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createApp } from './src/app.js';

// ---------------------------------------------------------------------------
// 1. 加载环境变量
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenvConfig({ path: resolve(__dirname, envFile) });

// ---------------------------------------------------------------------------
// 2. 环境适配
// ---------------------------------------------------------------------------

// 是否支持 ANSI 颜色输出（非 TTY 环境如日志文件/Docker 中去掉颜色码）
const IS_TTY = process.stdout.isTTY;

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

// Windows 终端默认 GBK 编码，强制切换 UTF-8 避免中文乱码
if (process.platform === 'win32' && process.stdout.isTTY) {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 编码切换失败不影响服务启动，日志中可能显示乱码
    console.warn(`⚠️ [Server] ${C.yellow}chcp 切换编码失败: ${e.message}${C.reset}`);
  }
}

/** 优雅关闭超时（毫秒），超时强制退出 */
const SHUTDOWN_TIMEOUT = 30_000;

/**
 * 启动 Fastify 服务
 * 依次初始化应用、绑定端口、监听启动日志
 *
 * @returns {Promise<void>}
 * @throws {Error} createApp 失败或端口绑定失败时抛出
 */
const start = async () => {
  const app = await createApp();

  const rawPort = parseInt(process.env.PORT || '3000', 10);
  const PORT = rawPort > 0 && rawPort <= 65535 ? rawPort : 3000;
  const addr = await app.listen({ port: PORT, host: '0.0.0.0' });

  const color = IS_TTY ? C.cyan : '';
  const reset = IS_TTY ? C.reset : '';
  console.log(`🚀 [Server] ${color}${addr}${reset}`);

  // ---------------------------------------------------------------------------
  // 3. 优雅关闭：处理系统信号
  // ---------------------------------------------------------------------------
  const shutdown = async signal => {
    console.log(`\n📦 [Server] 收到 ${signal}，正在优雅关闭...`);

    // 超时兜底：30s 后强制退出，防止 onClose 钩子挂起
    const forceExit = setTimeout(() => {
      console.error(`🚨 [Server] ${C.red}优雅关闭超时，强制退出${C.reset}`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);
    forceExit.unref();

    try {
      await app.close(); // 触发所有 onClose 钩子（DB/Redis/GuardConfig）
      clearTimeout(forceExit);
      console.log(`✅ [Server] ${C.green}已安全关闭${C.reset}`);
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      console.error(`❌ [Server] ${C.red}关闭异常: ${err.message}${C.reset}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch(err => {
  const color = IS_TTY ? C.red : '';
  const reset = IS_TTY ? C.reset : '';
  console.error(`🚨 [Server] ${color}启动异常: ${err.message}${reset}`, err.stack);
  process.exit(1);
});
