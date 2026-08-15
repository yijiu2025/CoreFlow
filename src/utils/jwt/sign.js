/**
 * JWT 签名原语
 *
 * 纯工具函数，封装 jsonwebtoken 的 sign 操作。
 * 密钥从 src/keys/ 获取，算法和默认密钥名从 src/keys/config.js 读取。
 *
 * @author yijiu
 * @since 2026-08-14
 */

import jwt from 'jsonwebtoken';
import { getPrivateKey } from '../../keys/index.js';
import { ALGORITHM, DEFAULT_KEY_NAME } from '../../keys/config.js';

/**
 * 签发 JWT
 * @param {object} payload - JWT Payload
 * @param {object} [options] - 额外签名选项
 * @param {string} [options.keyName=DEFAULT_KEY_NAME] - 密钥对名称（作为 kid 写入 header）
 * @param {string} [options.algorithm=ALGORITHM] - 签名算法，覆盖默认
 * @returns {Promise<string>} JWT 字符串
 */
export async function sign(payload, options = {}) {
  const { keyName = DEFAULT_KEY_NAME, algorithm = ALGORITHM, ...signOptions } = options;
  const privateKey = await getPrivateKey(keyName);
  return jwt.sign(payload, privateKey, {
    algorithm,
    keyid: keyName,
    ...signOptions
  });
}
