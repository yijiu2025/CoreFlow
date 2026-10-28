/**
 * 手机号加密工具
 * 使用 AES-256-CBC + 确定性 IV（HMAC-SHA256 派生），保证同一明文产生同一密文
 * 目的：加密存储手机号，同时保持唯一索引可用性
 *
 * 完整性保护：密文附带 HMAC-SHA256(密钥, iv||ciphertext) 标签，
 * 解密时先验签再解密，防止 CBC 密文被篡改（bit-flipping）后产生可控明文。
 *
 * @author Claude
 * @since 2026-07-13
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * 从环境变量获取密钥（32 字节 hex 字符串）
 * @returns {Buffer} 32 字节密钥 buffer
 * @throws {Error} PHONE_ENCRYPT_KEY 未配置或长度错误
 */
function getKey() {
  const keyHex = process.env.PHONE_ENCRYPT_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('PHONE_ENCRYPT_KEY 未配置或长度错误（需要 32 字节 hex 字符串，64 字符）');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * 生成确定性 IV：HMAC-SHA256(密钥, 手机号).slice(0, 16)
 * 确保同一手机号始终产生相同密文 → 唯一索引可用
 * @param {string} plain - 明文手机号
 * @returns {Buffer} 16 字节 IV buffer
 */
function deriveIv(plain) {
  const key = getKey();
  return crypto.createHmac('sha256', key).update(plain).digest().slice(0, IV_LENGTH);
}

/**
 * 计算完整性标签：HMAC-SHA256(密钥, iv || ciphertext)
 * @param {Buffer} iv - IV
 * @param {Buffer} ciphertext - 密文
 * @returns {Buffer} 32 字节 HMAC
 */
function signPayload(iv, ciphertext) {
  const key = getKey();
  return crypto.createHmac('sha256', key).update(iv).update(ciphertext).digest();
}

/**
 * 加密手机号
 * @param {string} plain - 明文手机号，如 '13812345678'
 * @returns {string} 加密字符串，格式: base64(IV):base64(ciphertext):base64(HMAC)
 */
function encryptPhone(plain) {
  if (!plain) return plain;
  const key = getKey();
  const iv = deriveIv(plain);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const mac = signPayload(iv, encrypted);
  return iv.toString('base64') + ':' + encrypted.toString('base64') + ':' + mac.toString('base64');
}

/**
 * 解密手机号
 * @param {string} encryptedStr - 加密字符串
 *   新格式: base64(IV):base64(ciphertext):base64(HMAC)
 *   旧格式: base64(IV):base64(ciphertext)（无完整性标签，向后兼容）
 * @returns {string} 明文手机号
 */
function decryptPhone(encryptedStr) {
  if (!encryptedStr || !encryptedStr.includes(':')) return encryptedStr;
  try {
    const parts = encryptedStr.split(':');
    const key = getKey();
    const iv = Buffer.from(parts[0], 'base64');
    const ciphertext = Buffer.from(parts[1], 'base64');

    // 新格式带 HMAC 标签：先验签，防 CBC 密文篡改
    if (parts.length === 3) {
      const expected = signPayload(iv, ciphertext);
      const actual = Buffer.from(parts[2], 'base64');
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        // 验签失败：不返回被篡改的明文，原样返回（调用方按旧明文兜底处理）
        return encryptedStr;
      }
    }

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // 解密失败（可能是旧明文数据），返回原值
    return encryptedStr;
  }
}

/**
 * 手机号掩码：138****1234
 * @param {string} phone
 * @returns {string}
 */
function maskPhone(phone) {
  if (!phone || phone.length < 7) return '****';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * 判断字符串是否为已加密格式（兼容新旧两种格式）
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (typeof value !== 'string' || !value.includes(':')) return false;
  const parts = value.split(':');
  return parts.length === 2 || parts.length === 3;
}

export { encryptPhone, decryptPhone, maskPhone, isEncrypted };
