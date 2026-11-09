/**
 * 手机号加密工具
 * 使用 AES-256-CBC + 确定性 IV（HMAC-SHA256 派生），保证同一明文产生同一密文
 * 目的：加密存储手机号，同时保持唯一索引可用性
 *
 * 完整性保护：密文附带 HMAC-SHA256(密钥, iv||ciphertext) 标签，
 * 解密时先验签再解密，防止 CBC 密文被篡改（bit-flipping）后产生可控明文。
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-cbc';
const IV_LENGTH = 16;
/** HMAC-SHA256 输出长度（字节） */
const MAC_LENGTH = 32;

/**
 * 严格 base64 形状（标准字母表 + 最多两个填充符）。
 * `Buffer.from(x, 'base64')` 是**宽松解码**：`'****'` 解出 0 字节、`'a:b'` 解出 1 字节，
 * 所以判断「是不是密文」必须先过这道正则，不能只靠能否解码。
 */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

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
 * 严格解码一段 base64；形状不合法返回 null（而不是宽松解出半截字节）
 * @param {string} text
 * @returns {Buffer|null}
 */
function decodeBase64(text) {
  if (typeof text !== 'string' || !BASE64_RE.test(text)) return null;
  return Buffer.from(text, 'base64');
}

/**
 * 加密手机号
 * @param {string} plain - 明文手机号，如 '13812345678'
 * @returns {string} 加密字符串，格式: base64(IV):base64(ciphertext):base64(HMAC)
 */
function encryptPhone(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  // 库字段理论上都是字符串；但数字型手机号传进来会在 cipher.update 里抛 TypeError，
  // 那会让调用方（模型 hook）在写入时炸掉，比"多一次 String()"代价大得多。
  const text = typeof plain === 'string' ? plain : String(plain);
  const key = getKey();
  const iv = deriveIv(text);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
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
  if (typeof encryptedStr !== 'string' || !encryptedStr.includes(':')) return encryptedStr;
  try {
    const parts = encryptedStr.split(':');
    const key = getKey();
    const iv = decodeBase64(parts[0]);
    const ciphertext = decodeBase64(parts[1]);

    // 形状不对就不是我们的密文（例如历史明文里恰好带一个冒号）：按原值兜底
    if (!iv || iv.length !== IV_LENGTH || !ciphertext || ciphertext.length === 0) return encryptedStr;

    // 新格式带 HMAC 标签：先验签，防 CBC 密文篡改
    if (parts.length === 3) {
      const actual = decodeBase64(parts[2]);
      if (!actual || actual.length !== MAC_LENGTH) return encryptedStr;
      const expected = signPayload(iv, ciphertext);
      if (!crypto.timingSafeEqual(expected, actual)) {
        // 验签失败：不返回被篡改的明文，原样返回（调用方按旧明文兜底处理）
        return encryptedStr;
      }
    }

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // 解密失败（可能是旧明文数据 / 填充被破坏），返回原值
    return encryptedStr;
  }
}

/**
 * 手机号掩码：138****1234
 *
 * 全仓唯一实现：`framework/security/verify/{sms,voice}/dao.js` 曾各带一份私有 copy，
 * 短号处理还不一致（一份返回 `'****'`、两处返回 `'1****'`），日志里同一手机号长得不一样。
 *
 * @param {string} phone
 * @returns {string} 掩码后的手机号；非字符串按空处理，短号整段隐去
 */
function maskPhone(phone) {
  const text = typeof phone === 'string' ? phone : phone === null || phone === undefined ? '' : String(phone);
  if (text.length < 7) return '****';
  return text.slice(0, 3) + '****' + text.slice(-4);
}

/**
 * 判断字符串是否为已加密格式（兼容新旧两种格式）
 *
 * 这个判据决定"要不要加密"（`models/user/User.js` 写入前），所以**宽进是危险的**：
 * 旧实现只看 `split(':').length`，于是 `'http://a.com'`、`'a:b'` 都会被当成密文而
 * 跳过加密 —— 明文手机号原样落库。现在要求两段都是合法 base64、IV 恰好 16 字节、
 * 密文非空、MAC（若有）恰好 32 字节。
 *
 * ⚠️ 只做**形状**校验，不验 MAC（验 MAC 需要密钥，且这是"是否需要加密"的前置判断）。
 *
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 2 && parts.length !== 3) return false;

  const iv = decodeBase64(parts[0]);
  if (!iv || iv.length !== IV_LENGTH) return false;

  const ciphertext = decodeBase64(parts[1]);
  // CBC 密文必为分组长度（16 字节）的整数倍
  if (!ciphertext || ciphertext.length === 0 || ciphertext.length % 16 !== 0) return false;

  if (parts.length === 3) {
    const mac = decodeBase64(parts[2]);
    if (!mac || mac.length !== MAC_LENGTH) return false;
  }
  return true;
}

export { encryptPhone, decryptPhone, maskPhone, isEncrypted };
