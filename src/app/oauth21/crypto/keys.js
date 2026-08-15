/**
 * 密钥管理——旧接口代理
 *
 * 保留向后兼容的同步接口，内部委托到 src/keys/ 子系统。
 * 新代码应直接使用 src/keys/。
 */

import {
  getPrivateKey as _getPrivateKey,
  getPublicKey as _getPublicKey,
  getJWKS as _getJWKS,
  generateKeyPair as _generateKeyPair,
  clearCache
} from '../../../keys/index.js';

export { clearCache };

/**
 * 生成 RSA 密钥对（内存操作，不写 DB，同步）
 * @param {object} [options]
 * @returns {{ privateKey, publicKey, jwk }}
 */
export function generateKeyPair(options) {
  return _generateKeyPair(options);
}

/**
 * 获取私钥 PEM（委托到 src/keys/，保持同步接口以防已有同步调用方）
 * @param {string} [name='default']
 * @returns {Promise<string>}
 */
export function getPrivateKey(name = 'default') {
  return _getPrivateKey(name);
}

/**
 * 获取公钥 PEM
 * @param {string} [name='default']
 * @returns {Promise<string>}
 */
export function getPublicKey(name = 'default') {
  return _getPublicKey(name);
}

/**
 * 获取 JWK 公钥集合
 * @param {string} [name='default']
 * @returns {Promise<object|null>}
 */
export function getJWKS(name = 'default') {
  return _getJWKS(name);
}
