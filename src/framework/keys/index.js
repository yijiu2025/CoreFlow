/**
 * 密钥管理子系统
 *
 * 统一出口，所有模块通过此文件导入密钥管理功能。
 * 内部按职责拆分：cache（缓存）/repository（DB）/accessor（读 API）/manager（生命周期）。
 *
 * @author yijiu
 * @since 2026-08-14
 */

// 读 API
export { getPrivateKey, getPublicKey, getPublicKeyByKid, getJWKS } from './accessor.js';
// 生命周期/CRUD
export {
  generateKid,
  generateKeyPair,
  createKey,
  rotateKey,
  listKeys,
  deleteKey,
  refreshCache,
  ensureCurrentKey
} from './manager.js';
// 缓存（供测试/管理刷新）
export { clearCache, getCurrentKid } from './cache.js';
// 常量
export { MODULUS_LENGTH_2048, ALGORITHMS } from './config.js';
