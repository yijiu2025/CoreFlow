/**
 * RetroWeb 对称加密工具（LLM 密钥加密用）
 *
 * 为什么不用 framework/keys（RSA）：那是**非对称**、面向"客户端拿公钥加密后回传，
 * 服务端私钥解"，适合登录这类"浏览器 → 服务端"的加密通道。而 LLM 密钥是**服务端自己
 * 存、服务端自己读**，用对称加密（AES-256-CBC）更合适，也更快。
 *
 * 🔴 密钥来源：用 `APP_SECRET`（.env 已有、生产要求 ≥32 位）经 SHA-256 派生 32 字节，
 *    **不引入新环境变量**。派生而非直接用原值，是避免 APP_SECRET 将来被其它用途用到
 *    时两处共享同一密钥材料。
 *
 * 🔴 加密范围：用户自建的 key（存 `keys_enc`）与系统官方的 key（只存内存）都走这里，
 *    同一套算法、同一把密钥，避免两套加解密逻辑。
 *
 * @since 2026-10-09
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 字节 nonce
const VERSION_PREFIX = 'v2:'; // v2 = AES-256-GCM（带完整性校验）；旧格式为 CBC `iv:cipher`

/** 从 APP_SECRET 派生 32 字节密钥（缓存，避免每次请求都派生） */
let cachedKey = null;
function key() {
  if (cachedKey) return cachedKey;
  const secret = process.env.APP_SECRET || '';
  if (secret.length < 32) {
    // 开发环境可能没配全；给个明确错误，别静默用弱密钥
    throw new Error('APP_SECRET 未配置或长度不足 32，无法加密 LLM 密钥');
  }
  cachedKey = crypto.createHash('sha256').update(secret).digest();
  return cachedKey;
}

/**
 * 加密字符串 → `v2:nonce:cipher:tag`（base64）
 * AES-256-GCM 自带完整性校验（GCM tag），杜绝 CBC 密文被篡改的问题。
 * @param {string} plain
 * @returns {string}
 */
function encryptSecret(plain) {
  if (!plain) return plain;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + iv.toString('base64') + ':' + enc.toString('base64') + ':' + tag.toString('base64');
}

/**
 * 解密字符串
 * - `v2:...` 新格式：GCM 解密 + 验签，验签失败/解密失败 → 原样返回（拒绝输出被篡改明文）
 * - 旧格式 `iv:cipher`：CBC 解密，向后兼容存量数据
 * - 非本格式 → 原样返回（旧明文数据平滑过渡）
 * @param {string} value
 * @returns {string}
 */
function decryptSecret(value) {
  if (!value || !value.includes(':')) return value;
  try {
    if (value.startsWith(VERSION_PREFIX)) {
      const [, ivB64, cipherB64, tagB64] = value.split(':');
      const iv = Buffer.from(ivB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');
      const decipher = crypto.createDecipheriv(ALGO, key(), iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]);
      return dec.toString('utf8');
    }
    // 旧 CBC 格式（无完整性标签）
    const [ivB64, cipherB64] = value.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key(), iv);
    const dec = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    // 解密失败（篡改 / 旧明文数据）→ 原样返回
    return value;
  }
}

export { encryptSecret, decryptSecret };
