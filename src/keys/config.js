/**
 * 密钥与签名算法配置
 *
 * 集中管理密钥对的默认参数与支持的签名算法列表。
 * @author yijiu
 * @since 2026-08-14
 */

/** 默认密钥对名称 */
export const DEFAULT_KEY_NAME = 'default';

/** 默认 RSA 密钥长度 */
export const DEFAULT_MODULUS_LENGTH = 2048;

/** 默认签名算法 */
export const ALGORITHM = 'RS256';

/** 支持的签名算法 */
export const ALGORITHMS = {
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