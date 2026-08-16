/**
 * OAuth 2.1 Token 端点
 *
 * POST /token   — 令牌签发（授权码 / 客户端凭证 / 刷新令牌）
 * POST /revoke  — 令牌撤销（RFC 7009）
 *
 * 业务逻辑见 app/oauth21/services/token.service.js（handleTokenGrant / handleRevoke）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { TokenService } from '../../../app/oauth21/services/token.service.js';
import { tokenSchema, revokeSchema } from './schemas/token.js';

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
   */
  registerSecureRoute(fastify, {
    name: 'issueToken',
    alias: '令牌签发',
    method: 'POST',
    url: '/token',
    schema: tokenSchema,
    handler: (request, reply) => tokenService.handleTokenGrant(request, reply)
  });

  /**
   * POST /revoke — 令牌撤销（RFC 7009）
   */
  registerSecureRoute(fastify, {
    name: 'revokeToken',
    alias: '令牌撤销',
    method: 'POST',
    url: '/revoke',
    schema: revokeSchema,
    handler: (request, reply) => tokenService.handleRevoke(request, reply)
  });
}
