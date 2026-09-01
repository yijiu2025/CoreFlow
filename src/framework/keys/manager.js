/**
 * 密钥生命周期管理
 *
 * 负责密钥对的生成、持久化、CRUD 与启动初始化。
 * 读 API 见 accessor.js；DB 访问见 repository.js；缓存见 cache.js。
 *
 * kid 规则：每个密钥对的 name 即 kid，由 generateKid() 生成唯一字母数字串，
 * 便于在 DB/日志中检索。
 *
 * @author yijiu
 * @since 2026-08-15
 */

import crypto from 'node:crypto';
import { ALGORITHMS, MODULUS_LENGTH_2048, withinGrace } from './config.js';
import { C } from '../../utils/colors.js';
import { setCachedKey, deleteCachedKey, setCurrentKid, getCurrentKid, clearCache } from './cache.js';
import { findNewestActive, findAll, insertKey, removeByName, setActive, existsByName } from './repository.js';

/** 自动生成 kid 碰撞时的重试上限（64 bit 熵下几乎不可能触发） */
const MAX_KID_RETRIES = 5;

/**
 * 判断是否为唯一约束冲突
 *
 * DB 的 unique 索引是 kid 唯一性的最终兜底；并发写入时可能在
 * existsByName 校验之后才触发唯一冲突，此时换 kid 重试即可。
 * @param {Error} err
 * @returns {boolean}
 */
function isUniqueViolation(err) {
  return err?.name === 'SequelizeUniqueConstraintError' || err?.parent?.code === 'ER_DUP_ENTRY';
}

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
 * 落地单个密钥对（生成 + 写 DB + 缓存 + 设为当前），不做存在性校验
 *
 * 供 createKey 在校验通过后调用；唯一性由调用方的重试循环 + DB 索引共同保证。
 * @param {string} kid
 * @param {object} opts - { algorithm, modulusLength, remark }
 * @returns {Promise<{publicKey: string, privateKey: string, jwk: object, kid: string}>}
 */
async function persistKey(kid, { algorithm, modulusLength, remark }) {
  const { privateKey, publicKey, jwk } = generateKeyPair({ modulusLength, algorithm, kid });

  await insertKey({
    name: kid,
    algorithm,
    private_key: privateKey,
    public_key: publicKey,
    jwk: JSON.stringify(jwk),
    active: true,
    remark
  });

  setCachedKey(kid, { privateKey, publicKey, jwk });
  setCurrentKid(kid); // 新密钥即当前签名密钥

  console.log(`✅ [Keys] ${C.green}已生成密钥对: ${kid} (${algorithm})${C.reset}`);
  return { publicKey, privateKey, jwk, kid };
}

/**
 * 生成新密钥对并写入 DB + 缓存，同时设为当前密钥
 *
 * kid 策略：
 * - 显式指定 kid：撞名直接抛错（调用方想要这个特定名，不能替换）
 * - 自动生成 kid：碰撞自动换 kid 重试，尽量不抛错（DB 唯一索引兜底并发冲突）
 *
 * @param {object} [options]
 * @param {string} [options.kid] - 指定 kid，未提供则自动生成唯一字母数字
 * @param {string} [options.algorithm=ALGORITHMS.RS256]
 * @param {number} [options.modulusLength=MODULUS_LENGTH_2048]
 * @param {string} [options.remark]
 * @returns {Promise<{publicKey: string, privateKey: string, jwk: object, kid: string}>}
 * @throws {Error} 显式 kid 已存在，或重试上限后仍碰撞
 */
async function createKey({ kid, algorithm = ALGORITHMS.RS256, modulusLength = MODULUS_LENGTH_2048, remark } = {}) {
  const opts = { algorithm, modulusLength, remark };

  // 显式指定 kid：撞名直接抛（调用方想要这个特定名，不能换）
  if (kid) {
    if (await existsByName(kid)) throw new Error(`密钥对 "${kid}" 已存在`);
    try {
      return await persistKey(kid, opts);
    } catch (err) {
      // 并发写入导致 DB 唯一冲突 → 视为已存在
      if (isUniqueViolation(err)) throw new Error(`密钥对 "${kid}" 已存在`, { cause: err });
      throw err;
    }
  }

  // 自动生成 kid：碰撞自动重试，尽量不抛错
  for (let attempt = 0; attempt < MAX_KID_RETRIES; attempt++) {
    const candidate = generateKid();
    if (await existsByName(candidate)) continue; // 校验碰撞 → 换 kid
    try {
      return await persistKey(candidate, opts);
    } catch (err) {
      // 并发写入碰撞（DB 唯一索引兜底）→ 换 kid 重试
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new Error(`生成唯一 kid 失败（重试 ${MAX_KID_RETRIES} 次仍碰撞）`);
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
 * 手动轮转密钥
 *
 * 生成新密钥并设为当前；旧密钥标记 active=false（updated_at 刷新为退役时刻），
 * 在宽限期内仍保留于 JWKS / 可验签旧 token；超过宽限的退役密钥在本次清理。
 *
 * @param {object} [options]
 * @param {string} [options.remark] - 备注标记
 * @returns {Promise<{publicKey: string, privateKey: string, jwk: object, kid: string}>} 新密钥信息
 */
async function rotateKey({ remark } = {}) {
  const oldKid = getCurrentKid();
  const created = await createKey({ remark: remark || 'rotateKey 轮转' });

  // 停用旧密钥：active=false，updated_at 自动刷新为退役时刻（宽限期内仍可验签）
  if (oldKid && oldKid !== created.kid) {
    await setActive(oldKid, false);
    deleteCachedKey(oldKid); // 移出缓存，验签时按需从 DB 读以准确判定宽限
  }

  // 清理已过宽限期的退役密钥，DB 不无限膨胀
  await pruneExpiredRetired();
  return created;
}

/**
 * 清理超过退役宽限期的密钥
 *
 * active=false 且 updated_at 超过宽限的密钥物理删除（其签发的 token 此时已全过期）。
 * @returns {Promise<number>} 清理数量
 */
async function pruneExpiredRetired() {
  const all = await findAll();
  let removed = 0;
  for (const record of all) {
    if (record.active) continue;
    if (!withinGrace(record.updatedAt)) {
      await removeByName(record.name);
      deleteCachedKey(record.name);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`🧹 [Keys] ${C.dim}已清理 ${removed} 个过期退役密钥${C.reset}`);
  }
  return removed;
}

/**
 * 手动刷新缓存
 *
 * 清空内存缓存并从 DB 重新加载当前密钥。用于缓存与 DB 不一致
 * （多实例、手动改库、密钥外部变更）时手动同步。
 *
 * @returns {Promise<string|null>} 当前 kid
 */
async function refreshCache() {
  clearCache();
  return ensureCurrentKey();
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

export {
  generateKid,
  generateKeyPair,
  createKey,
  rotateKey,
  pruneExpiredRetired,
  listKeys,
  deleteKey,
  refreshCache,
  ensureCurrentKey
};
