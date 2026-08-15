/**
 * RSA 加密工具类
 * 基于 Web Crypto API 实现 RSA-OAEP 加密
 *
 * 公钥缓存策略：
 * - 正常情况：缓存在内存中，页面生命周期内复用
 * - 解密失败时：调用 clearPublicKeyCache() 清除缓存，下次请求自动重新获取
 *
 * kid 回传：fetchPublicKey 缓存当前公钥的 kid，调用方通过 getCachedKid()
 * 取出并随登录/注册请求回传，后端用该 kid 查私钥解密。
 */

const SERVER = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
let cachedPublicKey: CryptoKey | null = null;
let cachedKeyId: string | null = null;

/**
 * 获取并导入服务器公钥
 * 通过 kid 判断密钥是否更新，自动刷新缓存
 */
export async function fetchPublicKey(): Promise<CryptoKey> {
  const resp = await fetch(`${SERVER}/oauth2.1/crypto/public-key`);
  if (!resp.ok) throw new Error('获取公钥失败');

  const data = await resp.json();
  const kid = data.kid;

  // 密钥未变化且已缓存，直接返回
  if (cachedPublicKey && cachedKeyId === kid) return cachedPublicKey;

  // 密钥变化或首次获取，重新导入
  cachedPublicKey = await crypto.subtle.importKey('jwk', data.key, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt'
  ]);
  cachedKeyId = kid;

  return cachedPublicKey;
}

/**
 * 获取当前缓存的 kid（供登录/注册请求回传）
 * 必须在 rsaEncrypt 之后调用（rsaEncrypt 会触发 fetchPublicKey 缓存 kid）
 * @returns 当前公钥 kid，未获取过返回 null
 */
export function getCachedKid(): string | null {
  return cachedKeyId;
}

/**
 * 清除公钥缓存（解密失败时调用）
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
  cachedKeyId = null;
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * RSA-OAEP 加密
 * @param plaintext 待加密明文
 */
export async function rsaEncrypt(plaintext: string): Promise<string> {
  const publicKey = await fetchPublicKey();
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, encoded);
  return arrayBufferToBase64(encrypted);
}

/**
 * 生成随机 Nonce
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
