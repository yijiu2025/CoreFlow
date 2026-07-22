/**
 * 加载器引擎入口
 * 初始化所有子模块：Redis → DB → Auth → Firewall → Models → API → Apps
 * 并同步守卫配置到持久化文件
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

/* eslint-disable no-console */

import { runEngine } from './engine.js';
import { loadGuardConfig, saveGuardConfig } from '../api/guard-config.js';
import { C } from '../utils/colors.js';

/**
 * 模块对外唯一接口，按引擎顺序初始化所有子模块
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @returns {Promise<void>}
 * @throws {Error} 引擎初始化失败时向上冒泡，阻止服务启动
 */
export async function initLoader(app) {
  console.log(`📦 [Loader] ${C.cyan}模块开始初始化...${C.reset}`);
  try {
    // 1. 从数据库加载已持久化的守卫配置（含 enabled/allowIps 等运行时状态）
    await loadGuardConfig();
    // 2. 按顺序加载所有注册模块（Redis → DB → Auth → Firewall → Models → API → Apps）
    await runEngine(app);
    // 3. 将代码级配置与持久化配置合并后写入数据库
    await saveGuardConfig();
    console.log(`✅ [Loader] ${C.green}所有子模块注册与配置同步完毕${C.reset}`);
  } catch (err) {
    console.error(`❌ [Loader] ${C.red}初始化异常: ${err.message}${C.reset}`);
    // 向上冒泡，阻止服务在未完成初始化的状态下启动
    throw err;
  }
}
