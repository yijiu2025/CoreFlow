import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'system',
    description: '系统端点',
    prefix: '/v1',
    requireLogin: false
  });

  /**
   * GET /health — 健康检查（K8s/Docker 健康探测）
   */
  registerSecureRoute(fastify, {
    name: 'health',
    alias: '健康检查',
    method: 'GET',
    url: '/health',
    requireLogin: false,
    handler: async (request, reply) => {
      return reply.result.success('ok', {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        redis: fastify.redisHealthy ? 'connected' : 'disconnected'
      });
    }
  });
}
