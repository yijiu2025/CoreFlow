/**
 * 密钥启动初始化
 *
 * 在 loader 阶段调用，确保默认密钥存在。
 * **只应在启动时执行一次**，依赖模型加载完成后。
 *
 * @author yijiu
 * @since 2026-08-14
 */

/* eslint-disable no-console */

import { getModel } from '../db/index.js';
import { createKey } from './manager.js';
import { DEFAULT_KEY_NAME, ALGORITHMS } from './config.js';
import { C } from '../../utils/colors.js';

/**
 * 确保默认密钥存在（启动时检测，无则自动生成）
 * @param {string} [name=DEFAULT_KEY_NAME] - 默认密钥对名称
 */
async function ensureDefaultKey(name = DEFAULT_KEY_NAME) {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) {
    console.warn(`⚠️ [Keys] ${C.yellow}KeyPair 模型未加载，跳过默认密钥初始化${C.reset}`);
    return;
  }

  const existing = await KeyPair.findOne({ where: { name } });
  if (existing) {
    console.log(`📦 [Keys] ${C.cyan}默认密钥对 "${name}" 已存在${C.reset}`);
    return;
  }

  await createKey({
    name,
    algorithm: ALGORITHMS.RS256,
    remark: '自动生成的默认密钥对'
  });
}

export { ensureDefaultKey };
