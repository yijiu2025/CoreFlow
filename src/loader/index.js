// src/loader/index.js
import { runEngine } from './engine.js';
import { saveGuardConfig } from '../api/guard-config.js';

/**
 * 模块对外唯一接口
 * 会加载api，config，db，router，service，validator
 */
export async function initLoader(app) {
  console.log('📦 [Module: Loader] 模块开始初始化...');
  try {
    await runEngine(app);
    // 所有路由注册完成后，执行配置剪枝与保存
    saveGuardConfig();
    console.log('✨ [Module: Loader] 所有子模块注册与配置同步完毕');
  } catch (err) {
    // 模块内部消化错误，保证健壮性
    console.error('🚨 [Module: Loader] 初始化过程中出现未捕获异常:', err.message);
  }
}
