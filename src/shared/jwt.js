/**
 * 共享 JWT 工具
 *
 * 从 oauth21/crypto/jwt.js 中提取，供 auth/ 和 oauth21/ 共同使用。
 * 避免 auth 模块直接依赖 oauth21 模块。
 */

import jwt from 'jsonwebtoken';
import { getPublicKey } from '../app/oauth21/crypto/keys.js';
import config from '../app/oauth21/config/config.js';

/**
 * 验证 JWT Token
 * @param {string} token - JWT 字符串
 * @returns {object} 解析后的 payload
 * @throws {Error} 验证失败时抛出
 */
export function verifyJwt(token) {
  const publicKey = getPublicKey();
  return jwt.verify(token, publicKey, {
    algorithms: [config.jwt.algorithm]
  });
}
