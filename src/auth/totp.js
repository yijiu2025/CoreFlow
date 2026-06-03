/**
 * TOTP (Time-based One-Time Password) 模块
 * 基于 Web Crypto API 实现，无需外部依赖
 *
 * 用于二次验证（2FA），用户绑定后每次登录需要输入 6 位验证码
 */
import crypto from 'node:crypto';

/** 默认配置 */
const DEFAULT_CONFIG = {
  digits: 6,           // 验证码位数
  period: 30,          // 时间步长（秒）
  algorithm: 'SHA-1',  // 哈希算法
  window: 1            // 容错窗口（前后各 1 个时间步长）
};

/**
 * 生成 TOTP 密钥
 * @param {string} [issuer='App'] 发行者名称
 * @param {string} [account] 账号名称
 * @returns {{ secret: string, uri: string }} 密钥和 OTP Auth URI
 */
export function generateSecret(issuer = 'App', account = '') {
  const secret = crypto.randomBytes(20).toString('base32');
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  return { secret, uri };
}

/**
 * 生成 TOTP 验证码
 * @param {string} secret Base32 编码的密钥
 * @param {number} [time=Date.now()] 时间戳（毫秒）
 * @param {object} [config] 配置
 * @returns {string} 6 位验证码
 */
export function generateTOTP(secret, time = Date.now(), config = DEFAULT_CONFIG) {
  const epoch = Math.floor(time / 1000);
  const counter = Math.floor(epoch / config.period);

  // Base32 解码
  const key = base32Decode(secret);

  // 计数器转 Buffer（8 字节大端序）
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(4, counter, false);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', Buffer.from(key));
  hmac.update(Buffer.from(counterBuffer));
  const hash = hmac.digest();

  // 动态截断
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % Math.pow(10, config.digits);

  return code.toString().padStart(config.digits, '0');
}

/**
 * 验证 TOTP 验证码
 * @param {string} secret Base32 编码的密钥
 * @param {string} code 用户输入的验证码
 * @param {object} [config] 配置
 * @returns {boolean}
 */
export function verifyTOTP(secret, code, config = DEFAULT_CONFIG) {
  const now = Date.now();

  // 检查当前时间步长和前后窗口
  for (let i = -config.window; i <= config.window; i++) {
    const time = now + i * config.period * 1000;
    const expected = generateTOTP(secret, time, config);
    if (timingSafeEqual(expected, code)) {
      return true;
    }
  }

  return false;
}

/**
 * Base32 解码
 * @param {string} input Base32 字符串
 * @returns {Uint8Array}
 */
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/, '').toUpperCase();

  let bits = '';
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error(`Invalid Base32 character: ${char}`);
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }

  return bytes;
}

/**
 * 常量时间字符串比较
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

export default { generateSecret, generateTOTP, verifyTOTP };
