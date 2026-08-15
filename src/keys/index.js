/**
 * 密钥管理子系统
 *
 * 统一出口，所有模块通过此文件导入密钥管理功能。
 * 不直接操作 DB，仅通过此 API 申请/获取/管理密钥。
 *
 * @author yijiu
 * @since 2026-08-14
 */

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
} from './manager.js';

export { ensureDefaultKey } from './ensure.js';
