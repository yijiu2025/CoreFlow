/**
 * 密钥与签名算法配置
 *
 * 集中管理密钥对的默认参数与支持的签名算法列表。
 * @author yijiu
 * @since 2026-08-14
 */

/** 默认 RSA 密钥长度（2048 位） */
const MODULUS_LENGTH_2048 = 2048;

/**
 * 退役密钥宽限期（秒）
 *
 * 轮转后旧密钥标记 active=false，但宽限期内仍需保留在 JWKS / 可用于验签
 * （旧 token 尚未过期）。超过宽限的旧密钥从 JWKS 移除并物理清理。
 * 应 >= 最长 token TTL（如 refresh token TTL）。默认 30 天。
 */
const KEY_RETIREMENT_GRACE_SECONDS = Number(process.env.KEY_RETIREMENT_GRACE_SECONDS) || 30 * 86400;

/**
 * 判断密钥是否在退役宽限期内
 * @param {string|Date|null} updatedAt - 密钥最后更新时间（退役时刷新为退役时刻）
 * @returns {boolean}
 */
function withinGrace(updatedAt) {
  if (!updatedAt) return false;
  const ageSec = (Date.now() - new Date(updatedAt).getTime()) / 1000;
  return ageSec <= KEY_RETIREMENT_GRACE_SECONDS;
}

/** 支持的签名算法 */
const ALGORITHMS = {
  /** HMAC with SHA-256 */
  HS256: 'HS256',
  /** HMAC with SHA-384 */
  HS384: 'HS384',
  /** HMAC with SHA-512 */
  HS512: 'HS512',
  /** RSA with SHA-256 */
  RS256: 'RS256',
  /** RSA with SHA-384 */
  RS384: 'RS384',
  /** RSA with SHA-512 */
  RS512: 'RS512',
  /** ECDSA with SHA-256 */
  ES256: 'ES256',
  /** ECDSA with SHA-384 */
  ES384: 'ES384',
  /** ECDSA with SHA-512 */
  ES512: 'ES512',
  /** RSASSA-PSS with SHA-256 */
  PS256: 'PS256',
  /** RSASSA-PSS with SHA-384 */
  PS384: 'PS384',
  /** RSASSA-PSS with SHA-512 */
  PS512: 'PS512',
  /** EdDSA (Ed25519 / Ed448) */
  EdDSA: 'EdDSA'
};

export { MODULUS_LENGTH_2048, ALGORITHMS, KEY_RETIREMENT_GRACE_SECONDS, withinGrace };
