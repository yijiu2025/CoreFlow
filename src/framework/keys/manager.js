/**
 * 密钥生命周期管理
 *
 * 负责密钥对的生成、持久化、CRUD 与启动初始化。
 * 读 API 见 accessor.js；DB 访问见 repository.js；缓存见 cache.js。
 *
 * kid 规则：每个密钥对的 name 即 kid，由 generateKid() 生成唯一字母数字串，
 * 便于在 DB/日志中检索；不再使用固定的 'default'。
 *
 * @author yijiu
 * @since 2026-08-15
 */

/* eslint-disable no-console */

import crypto from 'node:crypto';
import { ALGORITHMS, MODULUS_LENGTH_2048 } from './config.js';
import { C } from '../../utils/colors.js';
import { setCachedKey, deleteCachedKey, setCurrentKid, getCurrentKid } from './cache.js';
import { findNewestActive, findAll, insertKey, removeByName, existsByName } from './repository.js';

/**
 * 生成唯一字母数字 kid
 *
 * 格式：'k' + 16 位 hex（crypto.randomBytes），字母数字、唯一、便于检索。
 * @returns {string}
 */
function generateKid() {
  return `k${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * 在内存中生成 RSA 密钥对（不写 DB）
 * @param {object} [options]
 * @param {number} [options.modulusLength=MODULUS_LENGTH_2048]
 * @param {string} [options.algorithm=ALGORITHMS.RS256]
 * @param {string} [options.kid] - 写入 jwk 的 kid，未提供则由调用方补
 * @returns {{ privateKey: string, publicKey: string, jwk: object }}
 */
function generateKeyPair({ modulusLength = MODULUS_LENGTH_2048, algorithm = ALGORITHMS.RS256, kid = '' } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const pubKeyObj = crypto.createPublicKey(publicKey);
  const jwk = pubKeyObj.export({ format: 'jwk' });

  return { privateKey, publicKey, jwk: { ...jwk, kid, use: 'sig', alg: algorithm } };
}

/**
 * 生成新密钥对并写入 DB + 缓存，同时设为当前密钥
 *
 * @param {object} [options]
 * @param {string} [options.kid] - 指定 kid，未提供则自动生成唯一字母数字
 * @param {string} [options.algorithm=ALGORITHMS.RS256]
 * @param {number} [options.modulusLength=MODULUS_LENGTH_2048]
 * @param {string} [options.remark]
 * @returns {Promise<{publicKey: string, privateKey: string, jwk: object, kid: string}>}
 * @throws {Error} kid 已存在
 */
async function createKey({ kid, algorithm = ALGORITHMS.RS256, modulusLength = MODULUS_LENGTH_2048, remark } = {}) {
  const resolvedKid = kid || generateKid();

  if (await existsByName(resolvedKid)) {
    throw new Error(`密钥对 "${resolvedKid}" 已存在`);
  }

  const { privateKey, publicKey, jwk } = generateKeyPair({ modulusLength, algorithm, kid: resolvedKid });

  await insertKey({
    name: resolvedKid,
    algorithm,
    private_key: privateKey,
    public_key: publicKey,
    jwk: JSON.stringify(jwk),
    active: true,
    remark
  });

  setCachedKey(resolvedKid, { privateKey, publicKey, jwk });
  setCurrentKid(resolvedKid); // 新密钥即当前签名密钥

  console.log(`✅ [Keys] ${C.green}已生成密钥对: ${resolvedKid} (${algorithm})${C.reset}`);
  return { publicKey, privateKey, jwk, kid: resolvedKid };
}

/**
 * 列出所有密钥对（含未启用，供管理端）
 * @returns {Promise<Array>}
 */
async function listKeys() {
  return findAll();
}

/**
 * 删除指定密钥对（DB + 缓存）
 *
 * 建议先标记 active=false 待旧 token 过期再物理删除。
 * 若删除的是当前密钥，自动将最新 active 密钥提升为当前。
 *
 * @param {string} kid
 */
async function deleteKey(kid) {
  await removeByName(kid);
  deleteCachedKey(kid);

  // 删除当前密钥后，重选最新 active 为当前
  if (getCurrentKid() === kid) {
    const newest = await findNewestActive();
    setCurrentKid(newest ? newest.name : null);
  }

  console.log(`✅ [Keys] ${C.green}已删除密钥对: ${kid}${C.reset}`);
}

/**
 * 启动初始化：确保系统有"当前密钥"
 *
 * 取 DB 最新 active 密钥设为当前并入缓存；DB 无密钥则生成新密钥。
 * 仅在启动时调用一次，依赖 KeyPair 模型已加载。
 *
 * @returns {Promise<string|null>} 当前 kid
 */
async function ensureCurrentKey() {
  // 1. 已有当前密钥（缓存）则跳过
  if (getCurrentKid()) return getCurrentKid();

  // 2. 取 DB 最新 active 密钥
  const newest = await findNewestActive();
  if (newest) {
    setCachedKey(newest.name, {
      privateKey: newest.private_key,
      publicKey: newest.public_key,
      jwk: newest.jwk ? JSON.parse(newest.jwk) : null
    });
    setCurrentKid(newest.name);
    console.log(`📦 [Keys] ${C.cyan}当前密钥: ${newest.name}${C.reset}`);
    return newest.name;
  }

  // 3. DB 无任何密钥 → 生成
  const { kid } = await createKey({ remark: 'ensureCurrentKey 自动生成' });
  return kid;
}

export { generateKid, generateKeyPair, createKey, listKeys, deleteKey, ensureCurrentKey };
