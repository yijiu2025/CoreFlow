/**
 * 手机号加密工具
 * 使用 AES-256-CBC + 确定性 IV（HMAC-SHA256 派生），保证同一明文产生同一密文
 * 目的：加密存储手机号，同时保持唯一索引可用性
 */
import crypto from 'node:crypto'

const ALGO = 'aes-256-cbc'
const IV_LENGTH = 16

/** 从环境变量获取密钥（32 字节 hex 字符串） */
function getKey(): Buffer {
  const keyHex = process.env.PHONE_ENCRYPT_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('PHONE_ENCRYPT_KEY 未配置或长度错误（需要 32 字节 hex 字符串，64 字符）')
  }
  return Buffer.from(keyHex, 'hex')
}

/**
 * 生成确定性 IV：HMAC-SHA256(密钥, 手机号).slice(0, 16)
 * 确保同一手机号始终产生相同密文 → 唯一索引可用
 */
function deriveIv(plain: string): Buffer {
  const key = getKey()
  return crypto.createHmac('sha256', key).update(plain).digest().slice(0, IV_LENGTH)
}

/**
 * 加密手机号
 * @param plain - 明文手机号，如 '13812345678'
 * @returns 加密字符串，格式: base64(IV):base64(ciphertext)
 */
export function encryptPhone(plain: string): string {
  if (!plain) return plain
  const key = getKey()
  const iv = deriveIv(plain)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return iv.toString('base64') + ':' + encrypted.toString('base64')
}

/**
 * 解密手机号
 * @param encryptedStr - 加密字符串（格式: base64(IV):base64(ciphertext)）
 * @returns 明文手机号
 */
export function decryptPhone(encryptedStr: string): string {
  if (!encryptedStr || !encryptedStr.includes(':')) return encryptedStr
  try {
    const [ivB64, cipherB64] = encryptedStr.split(':')
    const key = getKey()
    const iv = Buffer.from(ivB64, 'base64')
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    // 解密失败（可能是旧明文数据），返回原值
    return encryptedStr
  }
}

/**
 * 手机号掩码：138****1234
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '****'
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

/**
 * 判断字符串是否为已加密格式
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.includes(':') && value.split(':').length === 2
}
