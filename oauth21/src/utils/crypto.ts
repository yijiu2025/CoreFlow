/**
 * RSA 加密工具类
 * 基于 Web Crypto API 实现 RSA-OAEP 加密
 */

const SERVER = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
let cachedPublicKey: CryptoKey | null = null;

/**
 * 获取并导入服务器公钥
 */
export async function fetchPublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey;
  
  const resp = await fetch(`${SERVER}/oauth2.1/crypto/public-key`);
  if (!resp.ok) throw new Error('获取公钥失败');
  
  const data = await resp.json();
  cachedPublicKey = await crypto.subtle.importKey(
    'jwk', 
    data.key,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false, 
    ['encrypt']
  );
  
  return cachedPublicKey;
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
  const encrypted = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' }, 
    publicKey, 
    encoded
  );
  return arrayBufferToBase64(encrypted);
}

/**
 * 生成随机 Nonce
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
