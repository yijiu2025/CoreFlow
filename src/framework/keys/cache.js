/**
 * 密钥内存缓存
 *
 * 持有密钥对缓存（kid → {privateKey, publicKey, jwk}）与"当前密钥"指针。
 * 所有密钥读取优先走缓存，缓存未命中再由 repository 落 DB（见 accessor.js）。
 *
 * "当前密钥"指针：kid 唯一字母数字后无法用固定名寻址签名密钥，
 * 故由 currentKid 标记系统当前使用的密钥，供签发/加密默认取用。
 *
 * @author yijiu
 * @since 2026-08-15
 */

/** kid → { privateKey, publicKey, jwk } */
const KEY_CACHE = new Map();

/** 当前系统使用的密钥 kid（由 ensureCurrentKey / createKey 维护） */
let currentKid = null;

/**
 * 读取缓存的密钥对
 * @param {string} kid
 * @returns {object|null}
 */
function getCachedKey(kid) {
  return KEY_CACHE.get(kid) ?? null;
}

/**
 * 写入缓存
 * @param {string} kid
 * @param {{privateKey: string, publicKey: string, jwk: object}} keyData
 */
function setCachedKey(kid, keyData) {
  KEY_CACHE.set(kid, keyData);
}

/**
 * 删除缓存项
 * @param {string} kid
 */
function deleteCachedKey(kid) {
  KEY_CACHE.delete(kid);
}

/**
 * 清空全部缓存（含当前指针），供测试或配置变更后刷新
 */
function clearCache() {
  KEY_CACHE.clear();
  currentKid = null;
}

/**
 * 获取缓存中全部密钥对（按 kid）
 * @returns {Array<[string, object]>}
 */
function getAllCachedKeys() {
  return Array.from(KEY_CACHE.entries());
}

/**
 * 读取当前密钥 kid
 * @returns {string|null}
 */
function getCurrentKid() {
  return currentKid;
}

/**
 * 设置当前密钥 kid
 * @param {string} kid
 */
function setCurrentKid(kid) {
  currentKid = kid;
}

export {
  KEY_CACHE,
  getCachedKey,
  setCachedKey,
  deleteCachedKey,
  clearCache,
  getAllCachedKeys,
  getCurrentKid,
  setCurrentKid
};
