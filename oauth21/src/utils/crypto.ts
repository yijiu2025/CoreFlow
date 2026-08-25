/**
 * RSA 加密工具类
 * 基于 Web Crypto API 实现 RSA-OAEP 加密
 *
 * 公钥缓存策略（双层：localStorage 持久 + 内存复用）：
 * - localStorage 缓存 { kid, jwk }，页面刷新后恢复到内存，避免每次加密都请求公钥端点
 * - 内存缓存 CryptoKey 对象（importKey 结果，避免重复 import 开销）
 * - 解密失败 / kid 不匹配：清除两层缓存，下次请求自动重新获取
 *
 * kid 回传：fetchPublicKey 缓存当前公钥的 kid，调用方通过 getCachedKid()
 * 取出并随登录/注册请求回传，后端用该 kid 查私钥解密。
 */

const SERVER = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const STORAGE_KEY = 'cf_oauth_pubkey';

let cachedPublicKey: CryptoKey | null = null;
let cachedKeyId: string | null = null;

/** 从 localStorage 恢复缓存（页面刷新后调用，或首次加密前懒加载） */
function restoreFromStorage(): { kid: string; jwk: JsonWebKey } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.kid && parsed?.jwk) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** 写入 localStorage（持久化 kid + jwk，下次刷新可复用） */
function persistToStorage(kid: string, jwk: JsonWebKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ kid, jwk }));
  } catch {
    // localStorage 不可用（隐私模式/满）→ 退化为纯内存缓存
  }
}

/** JWK → CryptoKey（importKey 封装） */
async function importJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

/**
 * 获取并导入服务器公钥
 * 优先 localStorage 持久缓存 → 内存缓存 → 请求公钥端点
 * 通过 kid 判断密钥是否更新，自动刷新缓存
 */
export async function fetchPublicKey(): Promise<CryptoKey> {
  // 1. 内存命中（同页面生命周期内最快）
  if (cachedPublicKey && cachedKeyId) return cachedPublicKey;

  // 2. localStorage 命中（页面刷新后恢复，免请求公钥端点）
  const stored = restoreFromStorage();
  if (stored) {
    try {
      cachedPublicKey = await importJwk(stored.jwk);
      cachedKeyId = stored.kid;
      return cachedPublicKey;
    } catch {
      // jwk 损坏，清掉走兜底
      clearPublicKeyCache();
    }
  }

  // 3. 请求公钥端点（首次 / 缓存失效）
  const resp = await fetch(`${SERVER}/oauth2.1/crypto/public-key`);
  if (!resp.ok) throw new Error('获取公钥失败');
  const data = await resp.json();
  const kid = data.kid;

  cachedPublicKey = await importJwk(data.key);
  cachedKeyId = kid;
  persistToStorage(kid, data.key);

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
 * 同时清内存 + localStorage，下次 fetchPublicKey 重新请求
 */
export function clearPublicKeyCache(): void {
  cachedPublicKey = null;
  cachedKeyId = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
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

/**
 * 组装加密登录请求的公共字段（kid + timestamp + nonce）
 *
 * 把 nonce/timestamp/kid 的拼装从 auth.ts API 层下沉到 crypto 工具层：
 * - API 层（auth.ts）只做请求转发，不含业务逻辑
 * - nonce 是 OIDC 防 replay 的随机值，由客户端生成是标准做法，后端原样回显
 * - kid 来自 fetchPublicKey 缓存，标识本次加密用的公钥版本
 *
 * @returns { kid, timestamp, nonce } 供 login 请求体使用
 */
export function buildEncryptedLoginPayload() {
  return {
    kid: getCachedKid(),
    timestamp: Date.now(),
    nonce: generateNonce()
  };
}
