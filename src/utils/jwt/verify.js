/**
 * JWT 验证原语
 *
 * 纯工具函数，封装 jsonwebtoken 的 verify 操作。
 * 从 JWT header 读取 kid 确定公钥，算法从 src/keys/config.js 读取。
 *
 * @author yijiu
 * @since 2026-08-14
 */

import jwt from 'jsonwebtoken';
import { getPublicKeyByKid } from '../../keys/index.js';
import { ALGORITHM, DEFAULT_KEY_NAME } from '../../keys/config.js';

/**
 * 验证 JWT
 * @param {string} token - JWT 字符串
 * @returns {Promise<object>} 解码后的 Payload
 * @throws {jwt.JsonWebTokenError} 签名无效或令牌过期时抛出
 */
export async function verify(token) {
  const header = jwt.decode(token, { complete: true })?.header;
  const kid = header?.kid || DEFAULT_KEY_NAME;
  const publicKey = await getPublicKeyByKid(kid);
  return jwt.verify(token, publicKey, {
    algorithms: [ALGORITHM]
  });
}