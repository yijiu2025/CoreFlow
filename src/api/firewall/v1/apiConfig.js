import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getAllGuardConfigs, setGuardConfig } from '../../guard-config.js';

export default async function (fastify) {
  // 1. 模块级配置 (Level 2) - 统一定义前缀和系统上下文
  registerGroupMetadata({
    name: 'apiConfigs',
    alias: '安全配置中心',
    description: '负责全域安全策略的实时分发与热更新，仅限受信任的管理内网访问。',
    prefix: '/v1/apiconfigs',
    enabled: true,
    requireLogin: false,
    allowIps: [],
    allowRoles: []
  });

  // 2. API 级配置 (Level 3) - 自动继承前缀和上下文
  registerSecureRoute(fastify, {
    name: 'getConfigs',
    alias: '查询全域安全矩阵',
    method: 'GET',
    url: '/', // 自动拼接为 /api/firewall/v1/apiconfigs/
    handler: async (request, reply) => {
      return reply.result.success('操作成功', getAllGuardConfigs());
    }
  });

  registerSecureRoute(fastify, {
    name: 'updateConfig',
    alias: '热更新策略详情',
    method: 'PATCH',
    url: '/:system/:group', // 自动拼接为 /api/v1/guard/configs/:system/:group
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
      const patch = request.body;
      const updated = setGuardConfig(system, patch, group, apiKey);
      if (!updated) return reply.result.fail('未找到指定配置路径', 404);
      return reply.result.success('安全策略已更新', updated);
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
      const configs = getAllGuardConfigs();
      const sys = configs[system];
      if (!sys) return reply.result.fail('系统不存在', 404);
      const group = sys.groups[groupKey];
      if (!group) return reply.result.fail('模块不存在', 404);
      let current = apiKey ? (group.apis ? group.apis[apiKey] : null) : group;
      if (!current) return reply.result.fail('接口不存在', 404);
      const newState = !current.enabled;
      setGuardConfig(system, { enabled: newState }, groupKey, apiKey);
      return reply.result.success('操作成功', { enabled: newState });
    }
  });

  registerSecureRoute(fastify, {
    name: 'toggleSystemConfig',
    alias: '系统全局防御开关',
    method: 'POST',
    url: '/toggle-system/:system',
    handler: async (request, reply) => {
      const { system } = request.params;
      const configs = getAllGuardConfigs();
      if (!configs[system]) return reply.result.fail('系统不存在', 404);
      const newState = !configs[system].enabled;
      setGuardConfig(system, { enabled: newState });
      return reply.result.success('操作成功', { enabled: newState });
    }
  });
}
