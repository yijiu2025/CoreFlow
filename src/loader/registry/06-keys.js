/**
 * 密钥初始化
 *
 * 在模型加载完成后执行，确保默认密钥对存在。
 * 依赖：KeyPair 模型已加载（06-models.js 执行后）
 *
 * @author yijiu
 * @since 2026-08-14
 */

import { ensureDefaultKey } from '../../keys/index.js';
import { C } from '../../utils/colors.js';

/* eslint-disable no-console */

export default async function (app) {
  try {
    await ensureDefaultKey();
    console.log(`🔑 [Loader: Keys] ${C.cyan}密钥初始化完成${C.reset}`);
  } catch (err) {
    console.error(`❌ [Loader: Keys] ${C.red}密钥初始化失败: ${err.message}${C.reset}`);
  }
}