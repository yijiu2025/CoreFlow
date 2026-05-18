// src/crypto/encryption.js
import crypto from 'node:crypto';
import { getPrivateKey, getPublicKey } from './keys.js';

const ENCRYPT_ALGO = 'RSA-OAEP';
const HASH = 'sha256';

/**
 * 获取用于前端加密的公钥（PEM + JWK 格式）
 */
export function getEncryptionPublicKey() {
  const publicKey = getPublicKey();
  const pem = publicKey;
  const jwk = crypto.createPublicKey(publicKey).export({ format: 'jwk' });

  return {
    pem,
    jwk,
    keyId: 'oauth21-key-1',
    algorithm: ENCRYPT_ALGO
  };
}

/**
 * 后端解密前端加密的数据
 * @param {string} encryptedBase64 - Base64 编码的密文
 * @returns {string} 明文
 */
export function decrypt(encryptedBase64) {
  const privateKey = getPrivateKey();
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: HASH
    },
    encrypted
  );
  return decrypted.toString('utf8');
}

/**
 * 验证时间戳是否在允许窗口内（防重放攻击）
 * @param {number} timestamp - 客户端提交的时间戳（毫秒）
 * @param {number} maxAgeMs  - 最大允许的时间差（毫秒）
 * @returns {boolean}
 */
export function validateTimestamp(timestamp, maxAgeMs = 30_000) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return false;
  return Math.abs(Date.now() - timestamp) <= maxAgeMs;
}
