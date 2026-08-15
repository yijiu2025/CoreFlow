/**
 * JWT 签名与验证
 *
 * 封装 jsonwebtoken 的 sign/verify 操作，密钥从 src/keys/ 获取。
 * @author yijiu
 * @since 2026-08-14
 */

import jwt from 'jsonwebtoken';
import { getPrivateKey, getPublicKeyByKid } from '../keys/index.js';
import { ALGORITHMS, DEFAULT_KEY_NAME } from '../keys/config.js';

/**
 * 签发 JWT
 * @param {object} payload - JWT Payload
 * @param {object} [options] - 额外签名选项
 * @param {string} [options.keyName=DEFAULT_KEY_NAME] - 密钥对名称（作为 kid 写入 header）
 * @param {string} [options.algorithm=ALGORITHMS.RS256] - 签名算法
 * @returns {Promise<string>} JWT 字符串
 */
async function sign(payload, options = {}) {
  const { keyName = DEFAULT_KEY_NAME, algorithm = ALGORITHMS.RS256, ...signOptions } = options;
  const privateKey = await getPrivateKey(keyName);
  return jwt.sign(payload, privateKey, {
    algorithm,
    keyid: keyName,
    ...signOptions
  });
}

/**
 * 验证 JWT
 * @param {string} token - JWT 字符串
 * @returns {Promise<object>} 解码后的 Payload
 * @throws {jwt.JsonWebTokenError} 签名无效或令牌过期时抛出
 */
async function verify(token) {
  const header = jwt.decode(token, { complete: true })?.header;
  const kid = header?.kid || DEFAULT_KEY_NAME;
  const publicKey = await getPublicKeyByKid(kid);
  return jwt.verify(token, publicKey, {
    algorithms: [ALGORITHMS.RS256]
  });
}

export { sign, verify };