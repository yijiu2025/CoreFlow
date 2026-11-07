/**
 * 对称加密工具（服务端自存自读的凭据加密）
 *
 * 归属 framework 层：`app/notice`（SMTP 密码）与 `app/retroweb`（LLM key）都要用，
 * 而 app 之间**禁止互相 import**（`__tests__/conventions/app-isolation.test.js`）。
 * 放在 framework 是唯一同时满足"单一实现"与"依赖方向 app → framework"的位置。
 *
 * 为什么不用 `framework/keys`（RSA）：那是**非对称**、面向"客户端拿公钥加密后回传，
 * 服务端私钥解"，适合登录这类浏览器 → 服务端通道。这里是服务端自己存、自己读，
 * 对称加密（AES-256-GCM）更快也更直接。
 *
 * 密钥来源：`APP_SECRET`（.env 已有、生产要求 ≥32 位）经 SHA-256 派生 32 字节，
 * **不引入新环境变量**。派生而非直接用原值，避免 APP_SECRET 将来被其它用途使用
 * 时两处共享同一份密钥材料。
 *
 * 格式：
 * - 现行 `v2:<ivB64>:<cipherB64>:<tagB64>` —— AES-256-GCM，自带完整性校验
 * - 旧格式 `iv:cipher` —— AES-256-CBC，仅用于读取存量数据（decrypt 兼容）
 *
 * @author yijiu2025
 * @since 2026-11-07 自 app/retroweb/utils/secret.js 上收（notice 也要用，避免两份实现）
 */
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
/** GCM 推荐 12 字节 nonce */
const IV_LENGTH = 12;
/** v2 = AES-256-GCM（带完整性校验）；旧格式为 CBC `iv:cipher` */
const VERSION_PREFIX = 'v2:';
/** APP_SECRET 最小长度（与 framework/config/env.js 的密钥强度判据一致） */
const MIN_SECRET_LENGTH = 32;

/** 从 APP_SECRET 派生 32 字节密钥（缓存，避免每次调用都派生） */
let cachedKey = null;
function key() {
  if (cachedKey) return cachedKey;
  const secret = process.env.APP_SECRET || '';
  if (secret.length < MIN_SECRET_LENGTH) {
    // 开发环境可能没配全；给明确错误，别静默用弱密钥
    throw new Error(`APP_SECRET 未配置或长度不足 ${MIN_SECRET_LENGTH}，无法加密服务端凭据`);
  }
  cachedKey = crypto.createHash('sha256').update(secret).digest();
  return cachedKey;
}

/**
 * 加密字符串 → `v2:nonce:cipher:tag`（base64）
 *
 * @param {string} plain 明文
 * @returns {string} 密文；入参为空时原样返回
 * @throws {Error} APP_SECRET 缺失/过短时
 */
function encryptSecret(plain) {
  if (!plain) return plain;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + iv.toString('base64') + ':' + enc.toString('base64') + ':' + tag.toString('base64');
}

/**
 * 解密字符串
 *
 * - `v2:...` 新格式：GCM 解密 + 验签，验签失败/解密失败 → 原样返回（拒绝输出被篡改明文）
 * - 旧格式 `iv:cipher`：CBC 解密，向后兼容存量数据
 * - 非本格式 → 原样返回（历史明文数据平滑过渡）
 *
 * @param {string} value 密文或明文
 * @returns {string} 明文
 */
function decryptSecret(value) {
  if (!value || !String(value).includes(':')) return value;
  const raw = String(value);
  try {
    if (raw.startsWith(VERSION_PREFIX)) {
      const [, ivB64, cipherB64, tagB64] = raw.split(':');
      const iv = Buffer.from(ivB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');
      const decipher = crypto.createDecipheriv(ALGO, key(), iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]);
      return dec.toString('utf8');
    }
    // 旧 CBC 格式（无完整性标签）
    const [ivB64, cipherB64] = raw.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key(), iv);
    const dec = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    // 解密失败（篡改 / 旧明文数据）→ 原样返回
    return value;
  }
}

/**
 * 凭据掩码（出接口只给尾 4 位，与前端 `mask_key` 同口径）
 *
 * 空值 → 空串；≤4 位 → 全掩码（保留尾 4 位等于把整个值露出来）；
 * 其余 → `****` + 尾 4 位。
 *
 * @param {string} value 明文凭据
 * @returns {string} 掩码串（`****xxxx`）
 */
function maskSecret(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 4) return '****';
  return '****' + s.slice(-4);
}

/**
 * 提交值是否是掩码（含 `*`）
 *
 * 面板的约定：前端拿到的是掩码，保存时原样回传；含 `*` 表示"沿用库里的旧值"，
 * 绝不能把掩码本身写进库（那样真凭据会被自己的掩码覆盖、永久不可恢复）。
 *
 * @param {unknown} value 前端回传的值
 * @returns {boolean}
 */
function isMasked(value) {
  return typeof value === 'string' && value.includes('*');
}

export { encryptSecret, decryptSecret, maskSecret, isMasked, MIN_SECRET_LENGTH };
