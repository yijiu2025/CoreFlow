/**
 * JWT 签名原语
 *
 * 纯工具函数，封装 jsonwebtoken 的 sign 操作。
 * 密钥从 oauth21 crypto/keys.js 获取（当前密钥管理未抽象到系统层）。
 *
 * @author yijiu
 * @since 2026-08-14
 */

import jwt from 'jsonwebtoken';
import { getPrivateKey } from '../../app/oauth21/crypto/keys.js';
import config from '../../app/oauth21/config/config.js';

const ALGORITHM = config.jwt.algorithm;
const KEY_ID = 'oauth21-key-1';

/**
 * 签发 JWT
 * @param {object} payload - JWT Payload
 * @param {object} [options] - 额外签名选项（会覆盖默认的 algorithm/keyid）
 * @returns {string} JWT 字符串
 */
export function sign(payload, options = {}) {
  const privateKey = getPrivateKey();
  return jwt.sign(payload, privateKey, {
    algorithm: ALGORITHM,
    keyid: KEY_ID,
    ...options
  });
}