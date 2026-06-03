/**
 * OpenID Connect Discovery 端点
 *
 * GET /.well-known/openid-configuration — OIDC 发现文档
 * GET /.well-known/jwks.json            — JWKS 公钥集
 *
 * 注意：用户信息端点 /userinfo 已迁移至 user/v1/user.js
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import config from '../../../app/oauth21/config/config.js';
import { getJWKS } from '../../../app/oauth21/crypto/keys.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'oidc',
    description: 'OpenID Connect 发现文档与 JWKS 公钥',
    enabled: true,
    requireLogin: false
  });

  /**
   * GET /.well-known/openid-configuration
   *
   * OIDC 发现文档，客户端可通过此端点自动发现授权服务器的所有端点和能力。
   */
  registerSecureRoute(fastify, {
    name: 'discovery',
    alias: 'OIDC 发现文档',
    method: 'GET',
    url: '/.well-known/openid-configuration',
    handler: async (request, reply) => {
      const iss = config.server.issuer;
      return {
        issuer: iss,
        authorization_endpoint: `${iss}/authorize`,
        token_endpoint: `${iss}/token`,
        userinfo_endpoint: `${iss}/user/v1/userinfo`,
        jwks_uri: `${iss}/.well-known/jwks.json`,
        revocation_endpoint: `${iss}/revoke`,
        device_authorization_endpoint: `${iss}/device/code`,
        response_types_supported: ['code'],
        grant_types_supported: [
          'authorization_code',
          'client_credentials',
          'refresh_token',
          'urn:ietf:params:oauth:grant-type:device_code'
        ],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
          'none'
        ],
        scopes_supported: ['openid', 'profile', 'email', 'api:read', 'api:write'],
        code_challenge_methods_supported: ['S256', 'plain'],
        claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'email', 'name', 'avatar', 'auth_time']
      };
    }
  });

  /**
   * GET /.well-known/jwks.json
   *
   * JSON Web Key Set，客户端用此公钥验证 JWT 签名。
   */
  registerSecureRoute(fastify, {
    name: 'jwks',
    alias: 'JWKS 公钥集',
    method: 'GET',
    url: '/.well-known/jwks.json',
    handler: async () => {
      return getJWKS();
    }
  });
}
