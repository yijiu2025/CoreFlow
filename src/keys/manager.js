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

import crypto from 'node:crypto';
import { getModel } from '../../../db/index.js';

const KEY_CACHE = new Map();

/**
 * 在内存中生成 RSA 密钥对（不写 DB）
 * @param {object} [options]
 * @param {number} [options.modulusLength=2048]
 * @param {string} [options.algorithm='RS256']
 * @returns {{ privateKey: string, publicKey: string, jwk: object }}
 */
export function generateKeyPair({ modulusLength = 2048, algorithm = 'RS256' } = {}) {
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
 * @param {string} [name='default'] - 密钥对名称
 * @returns {Promise<string>}
 */
export async function getPrivateKey(name = 'default') {
  let key = KEY_CACHE.get(name);
  if (!key) key = await loadKey(name);
  if (!key) throw new Error(`密钥对 "${name}" 不存在或未启用`);
  return key.privateKey;
}

/**
 * 获取公钥 SPKI PEM
 * @param {string} [name='default'] - 密钥对名称
 * @returns {Promise<string>}
 */
export async function getPublicKey(name = 'default') {
  let key = KEY_CACHE.get(name);
  if (!key) key = await loadKey(name);
  if (!key) throw new Error(`密钥对 "${name}" 不存在或未启用`);
  return key.publicKey;
}

/**
 * 获取 JWK 格式公钥
 * @param {string} [name='default'] - 密钥对名称
 * @returns {Promise<{keys:object[]}|null>}
 */
export async function getJWKS(name = 'default') {
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
export async function getPublicKeyByKid(kid) {
  if (!kid) return getPublicKey('default');
  return getPublicKey(kid);
}

/**
 * 生成新密钥对并写入 DB
 * @param {object} params
 * @param {string} params.name - 密钥对名称（唯一）
 * @param {string} [params.algorithm='RS256']
 * @param {number} [params.modulusLength=2048]
 * @param {string} [params.remark]
 * @returns {Promise<object>} 数据库记录
 */
export async function createKey({ name, algorithm = 'RS256', modulusLength = 2048, remark }) {
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
  console.log(`[Keys] 已生成密钥对: ${name} (${algorithm})`);
  return record;
}

/**
 * 列出所有密钥对
 * @returns {Promise<Array>}
 */
export async function listKeys() {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) return [];
  return KeyPair.findAll({ order: [['created_at', 'DESC']] });
}

/**
 * 销毁指定密钥对（从 DB 删除 + 清缓存）—— 仅主动轮转时使用
 * 建议先标记为非活跃（active=false），待旧 token 全部过期后再物理删除
 * @param {string} name
 */
export async function deleteKey(name) {
  const KeyPair = getModel('KeyPair');
  if (!KeyPair) throw new Error('KeyPair 模型未加载');
  await KeyPair.destroy({ where: { name } });
  KEY_CACHE.delete(name);
  console.log(`[Keys] 已删除密钥对: ${name}`);
}

/**
 * 清空内存缓存（供测试或配置变更后刷新）
 */
export function clearCache() {
  KEY_CACHE.clear();
}