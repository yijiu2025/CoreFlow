// src/loader/index.js
import { runEngine } from './engine.js';
import { saveGuardConfig } from '../api/guard-config.js';

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m' };

/**
 * 模块对外唯一接口
 * 会加载api，config，db，router，service，validator
 */
export async function initLoader(app) {
  console.log(`📦 [Loader] ${C.cyan}模块开始初始化...${C.reset}`);
  try {
    await runEngine(app);
    saveGuardConfig();
    console.log(`✅ [Loader] ${C.green}所有子模块注册与配置同步完毕${C.reset}`);
  } catch (err) {
    console.error(`❌ [Loader] ${C.red}初始化过程中出现未捕获异常: ${err.message}${C.reset}`);
  }
}
