/**
 * 密钥管理器
 *
 * 管理 RSA 密钥对的完整生命周期：
 * - 生成新密钥对并持久化到 DB（私钥 PEM + 公钥 PEM + JWK）
 * - 按名称缓存查询，支持多密钥轮转（kid 标识）
 * - 持有者通过名称传递密钥：签发时指定名称（写入 JWT header kid），
 *   验证时从 JWT header 读取 kid 确定公钥。
 *
 * @author yijiu
 * @since 2026-08-14
 */

/* eslint-disable no-console */

import crypto from 'node:crypto';
import { getModel } from '../db/index.js';
import { ALGORITHMS, DEFAULT_KEY_NAME, MODULUS_LENGTH_2048 } from './config.js';
import { C } from '../../utils/colors.js';

const KEY_CACHE = new Map();

/**
 * 在内存中生成 RSA 密钥对（不写 DB）
 * @param {object} [options]
 * @param {number} [options.modulusLength=MODULUS_LENGTH_2048]
 * @param {string} [options.algorithm=ALGORITHMS.RS256]
 * @returns {{ privateKey: string, publicKey: string, jwk: object }}
 */
function generateKeyPair({ modulusLength = MODULUS_LENGTH_2048, algorithm = ALGORITHMS.RS256 } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const pubKeyObj = crypto.createPublicKey(publicKey);
  const jwk = pubKeyObj.export({ format: 'jwk' });

  return { privateKey, publicKey, jwk: { ...jwk, kid: '', use: 'sig', alg: algorithm } };
}

/**
 * 从 DB 加载密钥对到缓存
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function loadKey(name) {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) return null;

  try {
    const record = await KeyPair.findOne({ where: { name, active: true } });
    if (!record) return null;

    const keyData = {
      privateKey: record.private_key,
      publicKey: record.public_key,
      jwk: record.jwk ? JSON.parse(record.jwk) : null
    };
    KEY_CACHE.set(name, keyData);
    return keyData;
  } catch {
    return null;
  }
}

/**
 * 获取私钥 PKCS#8 PEM
 * @param {string} [name=DEFAULT_KEY_NAME] - 密钥对名称
 * @returns {Promise<string>}
 */
async function getPrivateKey(name = DEFAULT_KEY_NAME) {
  let key = KEY_CACHE.get(name);
  if (!key) key = await loadKey(name);
  if (!key) throw new Error(`密钥对 "${name}" 不存在或未启用`);
  return key.privateKey;
}

/**
 * 获取公钥 SPKI PEM
 * @param {string} [name=DEFAULT_KEY_NAME] - 密钥对名称
 * @returns {Promise<string>}
 */
async function getPublicKey(name = DEFAULT_KEY_NAME) {
  let key = KEY_CACHE.get(name);
  if (!key) key = await loadKey(name);
  if (!key) throw new Error(`密钥对 "${name}" 不存在或未启用`);
  return key.publicKey;
}

/**
 * 获取 JWK 格式公钥
 * @param {string} [name=DEFAULT_KEY_NAME] - 密钥对名称
 * @returns {Promise<{keys:object[]}|null>}
 */
async function getJWKS(name = DEFAULT_KEY_NAME) {
  let key = KEY_CACHE.get(name);
  if (!key) key = await loadKey(name);
  if (!key) return null;
  return { keys: [key.jwk] };
}

/**
 * 从 JWT header 的 kid 字段获取公钥 PEM
 * @param {string} kid - 密钥 ID（JWT header kid）
 * @returns {Promise<string>}
 */
async function getPublicKeyByKid(kid) {
  if (!kid) return getPublicKey(DEFAULT_KEY_NAME);
  return getPublicKey(kid);
}

/**
 * 生成新密钥对并写入 DB
 * @param {object} params
 * @param {string} params.name - 密钥对名称（唯一）
 * @param {string} [params.algorithm=ALGORITHMS.RS256]
 * @param {number} [params.modulusLength=MODULUS_LENGTH_2048]
 * @param {string} [params.remark]
 * @returns {Promise<object>} 数据库记录
 */
async function createKey({ name, algorithm = ALGORITHMS.RS256, modulusLength = MODULUS_LENGTH_2048, remark }) {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) throw new Error('KeyPair 模型未加载');

  const existing = await KeyPair.findOne({ where: { name } });
  if (existing) throw new Error(`密钥对名称 "${name}" 已存在`);

  const { privateKey, publicKey, jwk } = generateKeyPair({ modulusLength, algorithm });
  jwk.kid = name;

  const record = await KeyPair.create({
    name,
    algorithm,
    private_key: privateKey,
    public_key: publicKey,
    jwk: JSON.stringify(jwk),
    active: true,
    remark
  });

  KEY_CACHE.set(name, { privateKey, publicKey, jwk });
  console.log(`✅ [Keys] ${C.green}已生成密钥对: ${name} (${algorithm})${C.reset}`);
  return record;
}

/**
 * 列出所有密钥对
 * @returns {Promise<Array>}
 */
async function listKeys() {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) return [];
  return KeyPair.findAll({ order: [['created_at', 'DESC']] });
}

/**
 * 销毁指定密钥对（从 DB 删除 + 清缓存）
 * 建议先标记为非活跃（active=false），待旧 token 全部过期后再物理删除
 * @param {string} name
 */
async function deleteKey(name) {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) throw new Error('KeyPair 模型未加载');
  await KeyPair.destroy({ where: { name } });
  KEY_CACHE.delete(name);
  console.log(`✅ [Keys] ${C.green}已删除密钥对: ${name}${C.reset}`);
}

/**
 * 清空内存缓存（供测试或配置变更后刷新）
 */
function clearCache() {
  KEY_CACHE.clear();
}

export {
  generateKeyPair,
  getPrivateKey,
  getPublicKey,
  getPublicKeyByKid,
  getJWKS,
  createKey,
  listKeys,
  deleteKey,
  clearCache
};
