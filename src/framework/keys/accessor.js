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
 * 退役密钥宽限：旧密钥 active=false 后仍可在宽限期内验签（旧 token 未过期），
 * 超过宽限则视为不可用（getJWKS 不再暴露、loadKey 返回 null）。
 *
 * @author yijiu
 * @since 2026-08-15
 */

import { getCachedKey, setCachedKey, getCurrentKid, getAllCachedKeys } from './cache.js';
import { findByName, findAll } from './repository.js';
import { createKey } from './manager.js';
import { withinGrace } from './config.js';

/**
 * 从 DB 加载密钥对并写入缓存（仅 active 的才缓存）
 * @param {string} kid
 * @returns {Promise<object|null>} { privateKey, publicKey, jwk }
 */
async function loadKey(kid) {
  const record = await findByName(kid);
  if (!record) return null;
  // active 或在退役宽限期内才可用；过期退役密钥视为不存在
  if (!record.active && !withinGrace(record.updatedAt)) return null;
  const keyData = {
    privateKey: record.private_key,
    publicKey: record.public_key,
    jwk: record.jwk ? JSON.parse(record.jwk) : null
  };
  // 仅缓存 active 密钥；退役密钥每次从 DB 读以保证宽限判断准确
  if (record.active) setCachedKey(kid, keyData);
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
  if (!key) throw new Error(`密钥对 "${resolvedKid}" 不存在或已退役`);
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
    throw new Error(`密钥对 "${resolvedKid}" 不存在或已退役`);
  }

  // 无当前密钥 → 生成新密钥（写 DB+缓存，并设为当前）
  const { publicKey, kid: newKid } = await createKey({ remark: 'getPublicKey 自动生成' });
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
 * 获取 JWKS（所有可用公钥）
 *
 * 暴露 active 密钥 + 退役宽限期内的密钥（旧 token 仍需验签）。
 * 超过宽限的退役密钥不再暴露，避免 JWKS 无限膨胀。
 *
 * @param {string} [kid] - 可选密钥 ID；传入则只返回该 kid 的公钥（找不到返回空 keys），
 *                         不传则返回所有可用公钥（标准 JWKS 行为）
 * @returns {Promise<{keys: object[]}>}
 */
async function getJWKS(kid) {
  const seen = new Set();
  const keys = [];

  /** 若指定 kid，仅保留匹配的；否则全保留 */
  const accept = jwk => !kid || jwk.kid === kid;

  // DB 全量（含退役），按 active 或宽限过滤
  const records = await findAll();
  for (const record of records) {
    if (!record.jwk) continue;
    if (!record.active && !withinGrace(record.updatedAt)) continue; // 过宽限的退役密钥跳过
    const jwk = typeof record.jwk === 'string' ? JSON.parse(record.jwk) : record.jwk;
    if (!jwk || seen.has(jwk.kid) || !accept(jwk)) continue;
    seen.add(jwk.kid);
    keys.push(jwk);
  }

  // 合并缓存（防御性：理论上 active 缓存 ⊆ DB）
  for (const [, keyData] of getAllCachedKeys()) {
    if (!keyData.jwk || seen.has(keyData.jwk.kid) || !accept(keyData.jwk)) continue;
    seen.add(keyData.jwk.kid);
    keys.push(keyData.jwk);
  }

  return { keys };
}

export { getPrivateKey, getPublicKey, getPublicKeyByKid, getJWKS };
