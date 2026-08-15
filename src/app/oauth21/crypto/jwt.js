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
 * @author yijiu2025
 * @since 2026-07-13
 */
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config.js';
import { sign, verify } from '../../../framework/jwt/index.js';

/**
 * 签发 JWT 令牌
 *
 * JWT 仅做身份认证，不嵌入权限（permissions）。
 * 权限由验证侧从 Redis/DB 加载（loadUserPermissions），
 * 保持令牌轻量，权限变更即时生效无需等待 token 过期。
 *
 * 支持四种令牌类型：
 * - access_token: 资源访问令牌（OAuth 2.1 标准）
 * - id_token: OIDC 身份令牌（含用户身份信息）
 * - refresh_token: 刷新令牌（JWT 格式，用于长期刷新）
 * - client_token: 客户端凭证令牌（M2M，无用户上下文）
 *
 * @param {object} params
 * @param {string} params.sub - 主体 ID（用户 ID 或客户端 ID）
 * @param {string} params.aud - 受众（接收令牌的客户端 ID）
 * @param {'access_token'|'id_token'|'refresh_token'|'client_token'} [params.token_type='access_token'] - 令牌类型
 * @param {number} [params.ttl] - 过期时间（秒），默认使用 config 对应配置
 * @returns {Promise<{token: string, kid: string}>} JWT 字符串与密钥 ID
 */
async function issueToken({ sub, aud, token_type = 'access_token', ttl }) {
  const now = Math.floor(Date.now() / 1000);
  const defaultTtl = {
    access_token: config.jwt.accessTokenTTL,
    id_token: config.jwt.idTokenTTL,
    refresh_token: config.jwt.refreshTokenTTL,
    client_token: config.jwt.accessTokenTTL
  };
  const exp = ttl || defaultTtl[token_type] || config.jwt.accessTokenTTL;
  const payload = {
    iss: config.server.issuer,
    sub,
    aud,
    iat: now,
    exp: now + exp,
    jti: uuidv4(),
    token_type
  };
  const { token, kid } = await sign(payload);
  return { token, kid };
}

/**
 * 签发 Access Token（issueToken 的快捷调用）
 * @param {object} params
 * @param {string} params.sub - 用户标识
 * @param {string} params.aud - 受众（客户端 ID）
 * @returns {Promise<{token: string, kid: string}>} JWT Access Token 与密钥 ID
 */
async function issueAccessToken({ sub, aud }) {
  return issueToken({ sub, aud, token_type: 'access_token' });
}

/**
 * 签发 ID Token (OIDC)
 * @param {object} params - 令牌参数
 * @param {string} params.sub - 用户标识（User.uid）
 * @param {string} params.aud - 受众（客户端 ID）
 * @param {string} [params.nonce] - 一次性随机数（防重放）
 * @param {number} [params.auth_time] - 用户认证时间戳
 * @param {string} [params.email] - 用户邮箱
 * @param {string} [params.name] - 用户名称
 * @returns {Promise<{token: string, kid: string}>} JWT ID Token 与密钥 ID
 */
async function issueIdToken({ sub, aud, nonce, auth_time, email, name }) {
  const payload = {
    iss: config.server.issuer,
    sub,
    aud,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + config.jwt.idTokenTTL,
    auth_time: auth_time || Math.floor(Date.now() / 1000),
    token_type: 'id_token'
  };
  if (nonce) payload.nonce = nonce;
  if (email) payload.email = email;
  if (name) payload.name = name;
  const { token, kid } = await sign(payload);
  return { token, kid };
}

export { sign, verify, issueToken, issueAccessToken, issueIdToken };
