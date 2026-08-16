/**
 * Guard 安全配置中心路由
 *
 * GET   /            — 查询全域安全矩阵
 * PATCH /:system/:group — 热更新策略详情
 * POST  /toggle/:system/:group — 模块/接口一键开关
 * POST  /toggle-system/:system — 系统全局防御开关
 *
 * 业务逻辑见 app/guard/services/config.service.js（updateConfig/toggleConfig/toggleSystemConfig）。
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getAllGuardConfigs } from '../../guard-config.js';
import { updateConfig, toggleConfig, toggleSystemConfig } from '../../../app/guard/services/config.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'apiConfigs',
    alias: '安全配置中心',
    description: '负责全域安全策略的实时分发与热更新，仅限受信任的管理内网访问。',
    prefix: '/v1/apiconfigs',
    enabled: true,
    requireLogin: true,
    allowIps: [],
    allowRoles: []
  });

  registerSecureRoute(fastify, {
    name: 'getConfigs',
    alias: '查询全域安全矩阵',
    method: 'GET',
    url: '/',
    handler: async (request, reply) => {
      return reply.result.success('操作成功', getAllGuardConfigs());
    }
  });

  registerSecureRoute(fastify, {
    name: 'updateConfig',
    alias: '热更新策略详情',
    method: 'PATCH',
    url: '/:system/:group',
    schema: {
      params: {
        type: 'object',
        properties: { system: { type: 'string' }, group: { type: 'string' } }
      },
      querystring: { type: 'object', properties: { apiKey: { type: 'string' } } }
    },
    handler: async (request, reply) => {
      const { system, group } = request.params;
      const { apiKey } = request.query;
      const result = updateConfig(system, group, apiKey, request.body, request);
      if (!result.ok) {
        return reply.result.fail(result.message, null, result.statusCode);
      }
      return reply.result.success('安全策略已更新', result.updated);
    }
  });

  registerSecureRoute(fastify, {
    name: 'toggleConfig',
    alias: '策略一键开关 (模块/接口)',
    method: 'POST',
    url: '/toggle/:system/:group',
    handler: async (request, reply) => {
      const { system, group: groupKey } = request.params;
      const { apiKey } = request.query;
      const result = toggleConfig(system, groupKey, apiKey, request);
      if (!result.ok) {
        return reply.result.fail(result.message, null, result.statusCode);
      }
      return reply.result.success('操作成功', { enabled: result.enabled });
    }
  });

  registerSecureRoute(fastify, {
    name: 'toggleSystemConfig',
    alias: '系统全局防御开关',
    method: 'POST',
    url: '/toggle-system/:system',
    handler: async (request, reply) => {
      const { system } = request.params;
      const result = toggleSystemConfig(system, request);
      if (!result.ok) {
        return reply.result.fail(result.message, null, result.statusCode);
      }
      return reply.result.success('操作成功', { enabled: result.enabled });
    }
  });
}
