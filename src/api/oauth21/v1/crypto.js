/**
 * OAuth 2.1 加密工具端点
 *
 * GET /crypto/public-key — 获取前端加密公钥
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getEncryptionPublicKey } from '../../../oauth21/crypto/encryption.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'crypto',
    description: '加密工具端点',
    enabled: true,
    requireLogin: false
  });

  /**
   * GET /crypto/public-key
   *
   * 返回前端加密所需的 RSA 公钥（JWK 格式）。
   * 前端使用此公钥加密敏感数据（如密码）后再传输。
   * 公钥可缓存，建议 5 分钟刷新一次。
   */
  registerSecureRoute(fastify, {
    name: 'encryptionPublicKey',
    alias: '加密公钥',
    method: 'GET',
    url: '/crypto/public-key',
    handler: async (request, reply) => {
      const { jwk, keyId, algorithm } = getEncryptionPublicKey();

      reply.header('Cache-Control', 'public, max-age=300');

      return {
        key: jwk,
        kid: keyId,
        alg: algorithm,
        cache_hint: 'Cache for 5 minutes'
      };
    }
  });
}
