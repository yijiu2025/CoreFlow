/**
 * RetroWeb 大模型端点 API
 *
 * 两个来源（见 docs/plan-node-backend.md §6.5）：
 *   · `/profiles` —— 用户自建（owner=user），密钥加密落库、只回掩码；
 *   · `/official` —— 系统官方（owner=system），🔴 token 数量与值**永不回传**，
 *                   只回 name/model/quota，且暂不起用（enabled=false）。
 *
 * @since 2026-10-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { RETROWEB_PERMISSIONS } from '../../../app/retroweb/permission/index.js';
import llmProfileDao from '../../../app/retroweb/dao/llm-profile.dao.js';
import { officialModels } from '../../../app/retroweb/services/official-llm.service.js';

async function registerLlmRoutes(fastify) {
  registerGroupMetadata({
    name: 'llm',
    description: '大模型端点配置（用户自建 + 系统官方）',
    prefix: '/v1'
  });

  // ---- 用户自建配置 ----
  registerSecureRoute(fastify, {
    name: 'listLlmProfiles',
    alias: '获取我的大模型配置',
    method: 'GET',
    url: '/llm/profiles',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const list = await llmProfileDao.listByUser(userId);
      return reply.result.success(null, { profiles: list });
    }
  });

  registerSecureRoute(fastify, {
    name: 'upsertLlmProfile',
    alias: '保存大模型配置',
    method: 'POST',
    url: '/llm/profiles',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    schema: {
      body: {
        type: 'object',
        required: ['model'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string', maxLength: 100 },
          base_url: { type: 'string', maxLength: 500 },
          model: { type: 'string', maxLength: 100 },
          keys: { type: 'array', items: { type: 'string', maxLength: 500 } },
          active: { type: 'boolean' },
          max_tokens: { type: 'integer', minimum: 0 },
          extra_json: { type: 'object' }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { id, ...input } = request.body;
      const profile = await llmProfileDao.upsert(userId, input, id ?? null);
      return reply.result.success(null, { profile });
    }
  });

  registerSecureRoute(fastify, {
    name: 'deleteLlmProfile',
    alias: '删除大模型配置',
    method: 'DELETE',
    url: '/llm/profiles/:id',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { id } = request.params;
      await llmProfileDao.remove(userId, id);
      return reply.result.success();
    }
  });

  // ---- 官方模型清单（只回模型 + 配额） ----
  registerSecureRoute(fastify, {
    name: 'listOfficialLlms',
    alias: '获取官方模型清单',
    method: 'GET',
    url: '/llm/official',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (_request, reply) => {
      // 🔴 officialModels() 只含 name/model/quota/enabled，token 数量与值不外泄
      return reply.result.success(null, { models: officialModels() });
    }
  });
}

export default registerLlmRoutes;
