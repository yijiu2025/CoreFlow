/**
 * 密钥初始化
 *
 * 在模型加载完成后执行，确保默认密钥对存在。
 * 依赖：KeyPair 模型已加载（06-models.js 执行后）
 *
 * @author yijiu
 * @since 2026-08-14
 */

import { ensureCurrentKey } from '../../keys/index.js';
import { C } from '../../../utils/colors.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.loader.registry.07-keys');

export default async function (app) {
  try {
    await ensureCurrentKey();
    log.always(`🔑 [Loader: Keys] ${C.cyan}密钥初始化完成${C.reset}`);
  } catch (err) {
    log.error(`❌ [Loader: Keys] ${C.red}密钥初始化失败${C.reset}`, err);
  }
}
