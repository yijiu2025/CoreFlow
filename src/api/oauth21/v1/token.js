/**
 * OAuth 2.1 Token 端点
 *
 * POST /token   — 令牌签发（授权码 / 客户端凭证 / 刷新令牌）
 * POST /revoke  — 令牌撤销（RFC 7009）
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { TokenService, TokenError } from '../../../oauth21/services/token.service.js';
import config from '../../../oauth21/config/config.js';

const tokenService = new TokenService();

export default async function (fastify) {
  registerGroupMetadata({
    name: 'token',
    description: '令牌签发与撤销',
    enabled: true,
    requireLogin: false
  });

  /**
   * POST /token — 令牌端点
   *
   * 支持 grant_type:
   * - authorization_code: 授权码模式（含 PKCE 验证）
   * - client_credentials: 客户端凭证模式（M2M）
   * - refresh_token: 刷新令牌模式（含令牌轮换）
   */
  registerSecureRoute(fastify, {
    name: 'issueToken',
    alias: '令牌签发',
    method: 'POST',
    url: '/token',
    handler: async (request, reply) => {
      const { grant_type } = request.body;

      if (!grant_type) {
        return reply.code(400).send({
          error: 'invalid_request',
          error_description: 'grant_type is required'
        });
      }

      const client = await tokenService.authenticateClient(request);
      if (!client) {
        return reply.code(401).send({
          error: 'invalid_client',
          error_description: 'Client authentication failed'
        });
      }

      try {
        let result;

        switch (grant_type) {
          case 'authorization_code': {
            const { code, redirect_uri, code_verifier } = request.body;
            if (!code) throw new TokenError('invalid_request', 'code is required');
            if (!redirect_uri) throw new TokenError('invalid_request', 'redirect_uri is required');
            result = await tokenService.handleAuthorizationCode({
              code, redirect_uri, code_verifier, client
            });
            break;
          }

          case 'client_credentials': {
            const { scope } = request.body;
            result = await tokenService.handleClientCredentials({ client, scope });
            break;
          }

          case 'refresh_token': {
            const { refresh_token, scope } = request.body;
            if (!refresh_token) throw new TokenError('invalid_request', 'refresh_token is required');
            result = await tokenService.handleRefreshToken({ refresh_token, scope, client });
            break;
          }

          default:
            throw new TokenError('unsupported_grant_type', `Grant type "${grant_type}" is not supported`);
        }

        if (result && result.access_token) {
          reply.setCookie('access_token', result.access_token, {
            httpOnly: true,
            maxAge: (result.expires_in || 600) * 1000,
            path: '/',
            sameSite: 'lax'
          });
        }
        if (result && result.refresh_token) {
          reply.setCookie('refresh_token', result.refresh_token, {
            httpOnly: true,
            maxAge: (config.jwt.refreshTokenTTL || 604800) * 1000,
            path: '/oauth2.1/token',
            sameSite: 'strict'
          });
        }

        return result;
      } catch (err) {
        if (err instanceof TokenError) {
          return reply.code(err.statusCode).send(err.toJSON());
        }
        throw err;
      }
    }
  });

  /**
   * POST /revoke — 令牌撤销（RFC 7009）
   */
  registerSecureRoute(fastify, {
    name: 'revokeToken',
    alias: '令牌撤销',
    method: 'POST',
    url: '/revoke',
    handler: async (request, reply) => {
      const client = await tokenService.authenticateClient(request);
      if (!client) {
        return reply.code(401).send({ error: 'invalid_client' });
      }

      const { token, token_type_hint } = request.body;
      if (!token) {
        return reply.code(400).send({
          error: 'invalid_request',
          error_description: 'token is required'
        });
      }

      await tokenService.revokeToken({ token, token_type_hint, client });
      return reply.code(200).send();
    }
  });
}
