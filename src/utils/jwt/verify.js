/**
 * JWT 验证原语
 *
 * 纯工具函数，封装 jsonwebtoken 的 verify 操作。
 * 密钥从 oauth21 crypto/keys.js 获取。
 *
 * @author yijiu
 * @since 2026-08-14
 */

import jwt from 'jsonwebtoken';
import { getPublicKey } from '../../app/oauth21/crypto/keys.js';
import config from '../../app/oauth21/config/config.js';

const ALGORITHM = config.jwt.algorithm;

/**
 * 验证 JWT
 * @param {string} token - JWT 字符串
 * @returns {object} 解码后的 Payload
 * @throws {jwt.JsonWebTokenError} 签名无效或令牌过期时抛出
 */
export function verify(token) {
  const publicKey = getPublicKey();
  return jwt.verify(token, publicKey, {
    algorithms: [ALGORITHM]
  });
}
