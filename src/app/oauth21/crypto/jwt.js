/**
 * JWT 签发与验证工具
 *
 * 提供 OAuth 2.1 授权服务器的 JWT 令牌签发和验证能力。
 * 使用 RSA 非对称密钥（私钥签名、公钥验证），支持 kid 标识实现密钥轮转。
 *
 * 支持的令牌类型：
 * - Access Token: 资源访问令牌，包含 sub、client_id、scope 等标准 claims
 * - ID Token: OIDC 身份令牌，包含用户身份信息（email、name 等）
 *
 * @author Claude
 * @since 2026-07-13
 */
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config.js';
import { getPrivateKey, getPublicKey } from './keys.js';

const KEY_ID = 'oauth21-key-1';

/**
 * 签发 JWT
 * @param {object} payload - JWT Payload
 * @param {object} [options=jsonwebtoken.SignOptions] - 额外签名选项
 * @returns {string} JWT 字符串
 */
export function sign(payload, options = {}) {
  const privateKey = getPrivateKey();
  return jwt.sign(payload, privateKey, {
    algorithm: config.jwt.algorithm,
    keyid: KEY_ID,
    ...options
  });
}

/**
 * 验证 JWT
 * @param {string} token - JWT 字符串
 * @returns {object} 解码后的 Payload
 * @throws {jwt.JsonWebTokenError} 签名无效或令牌过期时抛出
 */
export function verify(token) {
  const publicKey = getPublicKey();
  return jwt.verify(token, publicKey, {
    algorithms: [config.jwt.algorithm]
  });
}

/**
 * 签发 Access Token
 * @param {object} params - 令牌参数
 * @param {string} params.sub - 用户标识（User.uid）
 * @param {string} params.client_id - 客户端 ID
 * @param {string} [params.scope] - 授权范围
 * @param {string} [params.aud] - 受众（默认使用 client_id）
 * @returns {string} JWT Access Token
 */
export function issueAccessToken({ sub, client_id, scope, aud }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.server.issuer,
    sub,
    aud: aud || client_id,
    client_id,
    scope,
    iat: now,
    exp: now + config.jwt.accessTokenTTL,
    jti: uuidv4(),
    token_type: 'access_token'
  };
  return sign(payload);
}

/**
 * 签发 ID Token (OIDC)
 * @param {object} params - 令牌参数
 * @param {string} params.sub - 用户标识（User.uid）
 * @param {string} params.client_id - 客户端 ID
 * @param {string} [params.nonce] - 一次性随机数（防重放）
 * @param {number} [params.auth_time] - 用户认证时间戳
 * @param {string} [params.email] - 用户邮箱
 * @param {string} [params.name] - 用户名称
 * @returns {string} JWT ID Token
 */
export function issueIdToken({
  sub,
  client_id,
  nonce,
  auth_time,
  email,
  name
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.server.issuer,
    sub,
    aud: client_id,
    iat: now,
    exp: now + config.jwt.idTokenTTL,
    auth_time: auth_time || now
  };
  if (nonce) payload.nonce = nonce;
  if (email) payload.email = email;
  if (name) payload.name = name;
  return sign(payload);
}
