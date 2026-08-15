/**
 * 密钥读 API
 *
 * 统一的密钥读取出口，返回形状一致：
 * - 公钥 getter 一律返回 { pem, kid }（调用方可能不知 kid，需回传用于解密）
 * - getPrivateKey 返回 PEM 字符串（调用方已知 kid）
 *
 * 不传/空 kid 时使用"当前密钥"指针（cache.currentKid），
 * 运行期纯走缓存，缓存未命中才落 DB。
 *
 * @author yijiu
 * @since 2026-08-15
 */

import { getCachedKey, setCachedKey, getCurrentKid, getAllCachedKeys } from './cache.js';
import { findActiveByName, findAllActive } from './repository.js';
import { createKey } from './manager.js';

/**
 * 从 DB 加载密钥对并写入缓存
 * @param {string} kid
 * @returns {Promise<object|null>} { privateKey, publicKey, jwk }
 */
async function loadKey(kid) {
  const record = await findActiveByName(kid);
  if (!record) return null;
  const keyData = {
    privateKey: record.private_key,
    publicKey: record.public_key,
    jwk: record.jwk ? JSON.parse(record.jwk) : null
  };
  setCachedKey(kid, keyData);
  return keyData;
}

/**
 * 获取私钥 PEM
 * @param {string} [kid] - 密钥 ID，空则用当前密钥
 * @returns {Promise<string>} PEM
 * @throws {Error} 密钥不存在
 */
async function getPrivateKey(kid) {
  const resolvedKid = kid || getCurrentKid();
  if (!resolvedKid) throw new Error('无可用的当前密钥，请先初始化密钥');
  let key = getCachedKey(resolvedKid);
  if (!key) key = await loadKey(resolvedKid);
  if (!key) throw new Error(`密钥对 "${resolvedKid}" 不存在或未启用`);
  return key.privateKey;
}

/**
 * 获取公钥 PEM 及其 kid
 *
 * 不传 kid 且无当前密钥时，自动生成新密钥（唯一 kid）并设为当前。
 *
 * @param {string} [kid] - 密钥 ID，空则用当前密钥
 * @returns {Promise<{pem: string, kid: string}>}
 */
async function getPublicKey(kid) {
  const resolvedKid = kid || getCurrentKid();
  if (resolvedKid) {
    let key = getCachedKey(resolvedKid);
    if (!key) key = await loadKey(resolvedKid);
    if (key) return { pem: key.publicKey, kid: resolvedKid };
    throw new Error(`密钥对 "${resolvedKid}" 不存在或未启用`);
  }

  // 无当前密钥 → 生成新密钥（写 DB+缓存，并设为当前）
  const { publicKey, kid: newKid } = await createKey({
    remark: 'getPublicKey 自动生成'
  });
  return { pem: publicKey, kid: newKid };
}

/**
 * 从 JWT header 的 kid 获取公钥（供 verify 使用）
 *
 * kid 为空时回退到当前密钥；当前密钥也不存在则自动生成。
 *
 * @param {string} [kid] - JWT header 的 kid
 * @returns {Promise<{pem: string, kid: string}>}
 */
async function getPublicKeyByKid(kid) {
  return getPublicKey(kid);
}

/**
 * 获取 JWKS（所有启用公钥）
 *
 * JWKS 需暴露全部 active 公钥，密钥轮转后旧 kid 仍需用于验旧 token，
 * 缓存不一定持有全部，故查 DB 合并缓存。
 *
 * @returns {Promise<{keys: object[]}>}
 */
async function getJWKS() {
  const seen = new Set();
  const keys = [];

  // DB 全量 active（权威来源）
  const records = await findAllActive();
  for (const record of records) {
    if (!record.jwk) continue;
    const jwk = typeof record.jwk === 'string' ? JSON.parse(record.jwk) : record.jwk;
    if (!jwk || seen.has(jwk.kid)) continue;
    seen.add(jwk.kid);
    keys.push(jwk);
  }

  // 合并缓存（防御性：理论上缓存 ⊆ DB，此处兜底）
  for (const [, keyData] of getAllCachedKeys()) {
    if (!keyData.jwk || seen.has(keyData.jwk.kid)) continue;
    seen.add(keyData.jwk.kid);
    keys.push(keyData.jwk);
  }

  return { keys };
}

export { getPrivateKey, getPublicKey, getPublicKeyByKid, getJWKS };
