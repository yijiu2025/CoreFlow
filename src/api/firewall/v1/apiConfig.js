/**
 * Guard 安全配置中心路由
 *
 * GET   /            — 查询全域安全矩阵
 * PATCH /:system/:group — 热更新策略详情
 * POST  /toggle/:system/:group — 模块/接口一键开关
 * POST  /toggle-system/:system — 系统全局防御开关
 *
 * 业务逻辑见 app/guard/services/config.service.js（updateConfig/toggleConfig/toggleSystemConfig）。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getAllGuardConfigs } from '../../guard-config.js';
import { updateConfig, toggleConfig, toggleSystemConfig } from '../../../app/guard/services/config.service.js';
import { FIREWALL_PERMISSIONS } from '../../../app/firewall/permission/index.js';

async function registerApiConfigRoutes(fastify) {
  registerGroupMetadata({
    name: 'apiConfigs',
    alias: '安全配置中心',
    description: '负责全域安全策略的实时分发与热更新，仅限受信任的管理内网访问。',
    prefix: '/v1/apiconfigs',
    enabled: true,
    requireLogin: true,
    allowIps: [],
    // 这里**不能**靠 allowRoles 兜底：`allowRoles: []` 的语义是「不限制角色」，
    // 于是任何登录用户（哪怕零角色）都能改全域 Guard 策略。
    // 授权统一由 requirePermission 表达（见各路由），角色不限。
    allowRoles: []
  });

  registerSecureRoute(fastify, {
    name: 'getConfigs',
    alias: '查询全域安全矩阵',
    method: 'GET',
    url: '/',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.READ,
    handler: async (request, reply) => {
      return reply.result.success('操作成功', getAllGuardConfigs());
    }
  });

  registerSecureRoute(fastify, {
    name: 'updateConfig',
    alias: '热更新策略详情',
    method: 'PATCH',
    url: '/:system/:group',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.WRITE,
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
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.TOGGLE,
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
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.CONFIG.TOGGLE,
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

export default registerApiConfigRoutes;
