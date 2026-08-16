/**
 * 加载器引擎入口
 * 初始化所有子模块：Redis → DB → Auth → Firewall → Models → API → Apps
 * 注册完成后从 DB 加载持久化守卫配置，覆盖代码级默认值
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

import { runEngine } from './engine.js';
import { loadGuardConfig } from '../../api/guard-config.js';
import { C } from '../../utils/colors.js';

/**
 * 模块对外唯一接口，按引擎顺序初始化所有子模块
 *
 * 执行顺序：
 * 1. runEngine → 注册所有模块，register* 设置代码级默认配置
 * 2. loadGuardConfig → 从 DB 加载持久化配置，覆盖代码级默认值（运维优先）
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @returns {Promise<void>}
 * @throws {Error} 引擎初始化失败时向上冒泡，阻止服务启动
 */
export async function initLoader(app) {
  // 防御性校验：防止传入 undefined 时抛出难以定位的 TypeError
  if (!app) throw new Error('initLoader: 参数 app 不能为空');

  console.log(`📦 [Loader] ${C.cyan}模块开始初始化...${C.reset}`);
  try {
    // 1. 按顺序加载所有注册模块（06-models 加载模型后 DB 操作才可用）
    await runEngine(app);
    // 2. 从 DB 加载持久化配置，覆盖代码级默认值（DB 配置优先，运维修改不丢失）
    await loadGuardConfig();
    console.log(`✅ [Loader] ${C.green}所有子模块注册与配置加载完毕${C.reset}`);
  } catch (err) {
    console.error(`❌ [Loader] ${C.red}初始化异常: ${err.message}${C.reset}`, err.stack);
    // 向上冒泡，阻止服务在未完成初始化的状态下启动
    throw err;
  }
}
