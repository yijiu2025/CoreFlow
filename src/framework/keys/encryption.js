/**
 * RSA 加密/解密与时间戳验证工具
 *
 * 提供前端加密公钥获取、后端解密和防重放时间戳验证能力。
 * 使用 RSA-OAEP (SHA-256) 算法，前端用公钥加密密码等敏感数据，后端用私钥解密。
 *
 * kid 回传链路：getEncryptionPublicKey 返回当前密钥的 kid → 前端缓存并随请求回传 →
 * decrypt(encrypted, kid) 用该 kid 查私钥解密。
 *
 * @author Claude
 * @since 2026-07-13
 */
import crypto from 'node:crypto';
import { getPrivateKey, getPublicKey } from '../../../framework/keys/index.js';

const ENCRYPT_ALGO = 'RSA-OAEP';
const HASH = 'sha256';

/**
 * 获取用于前端加密的公钥（PEM + JWK 格式）+ 当前密钥 kid
 * @returns {Promise<{pem: string, jwk: object, kid: string, algorithm: string}>} 公钥信息
 */
async function getEncryptionPublicKey() {
  const { pem, kid } = await getPublicKey();
  const jwk = crypto.createPublicKey(pem).export({ format: 'jwk' });

  return {
    pem,
    jwk,
    kid,
    algorithm: ENCRYPT_ALGO
  };
}

/**
 * 后端解密前端加密的数据
 * @param {string} encryptedBase64 - Base64 编码的密文
 * @param {string} [kid] - 密钥 ID（前端回传），不传则用当前密钥
 * @returns {Promise<string>} 明文
 */
async function decrypt(encryptedBase64, kid) {
  const privateKey = await getPrivateKey(kid);
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
function validateTimestamp(timestamp, maxAgeMs = 30_000) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return false;
  return Math.abs(Date.now() - timestamp) <= maxAgeMs;
}

export { getEncryptionPublicKey, decrypt, validateTimestamp };
