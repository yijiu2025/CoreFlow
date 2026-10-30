/**
 * 密钥初始化
 *
 * 在模型加载完成后执行，确保默认密钥对存在。
 * 依赖：KeyPair 模型已加载（06-models.js 执行后）
 *
 * @author yijiu
 * @since 2026-08-14
 */

import { ensureCurrentKey, assertKeyEncryptionReady } from '../../keys/index.js';
import { C } from '../../../utils/colors.js';
import { createLogger } from '../../log/index.js';

const log = createLogger('framework.loader.registry.07-keys');

async function keysLoader(app) {
  try {
    // 先自检信封加密：KEY_ENCRYPTION_REQUIRED=true 时缺 KEK 必须当场失败，
    // 而不是等到第一次签发才炸（也不能让明文私钥悄悄继续入库）
    assertKeyEncryptionReady();
    await ensureCurrentKey();
    log.always(`🔑 [Loader: Keys] ${C.cyan}密钥初始化完成${C.reset}`);
  } catch (err) {
    log.error(`❌ [Loader: Keys] ${C.red}密钥初始化失败${C.reset}`, err);
    throw err; // 密钥是签发/验签的硬依赖，失败必须 fail-fast
  }
}

export default keysLoader;
