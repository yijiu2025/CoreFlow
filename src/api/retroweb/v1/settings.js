/**
 * RetroWeb 用户设置 API
 *
 * 用户偏好（1:1），其中 `llm_source` 是后端认得的字段：
 *   · `user`    —— LLM 调用走用户自建（激活那套），官方兜底（默认）；
 *   · `official`—— LLM 调用走系统官方模型（token 不出后端）。
 *
 * 🔴 官方模型的 token 数量与值**永不回传**：这里只存一个「选哪个来源」的偏好，
 *    官方模型清单走 /llm/official（只回 name/model/quota）。
 *
 * @since 2026-10-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { RETROWEB_PERMISSIONS } from '../../../app/retroweb/permission/index.js';
import settingsDao from '../../../app/retroweb/dao/settings.dao.js';

async function registerSettingsRoutes(fastify) {
  registerGroupMetadata({
    name: 'settings',
    description: '用户设置（LLM 来源等偏好）',
    prefix: '/v1'
  });

  // 读用户设置（含 llm_source）
  registerSecureRoute(fastify, {
    name: 'getRetrowebSettings',
    alias: '获取我的设置',
    method: 'GET',
    url: '/settings',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const settings = await settingsDao.get(userId);
      return reply.result.success(null, { settings });
    }
  });

  // 写用户设置（llm_source 会被校验）
  registerSecureRoute(fastify, {
    name: 'putRetrowebSettings',
    alias: '保存我的设置',
    method: 'PUT',
    url: '/settings',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    schema: {
      body: {
        type: 'object',
        properties: {
          settings: { type: 'object' }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { settings } = request.body ?? {};
      try {
        const saved = await settingsDao.put(userId, settings ?? {});
        return reply.result.success(null, { settings: saved });
      } catch (e) {
        return reply.result.fail(e.message, null, 400);
      }
    }
  });

  // 单独切 LLM 来源（前端「来源选择」的落点，语义比整包 PUT 更聚焦）
  registerSecureRoute(fastify, {
    name: 'setRetrowebLlmSource',
    alias: '切换大模型来源',
    method: 'POST',
    url: '/settings/llm-source',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    schema: {
      body: {
        type: 'object',
        required: ['source'],
        properties: {
          source: { type: 'string', enum: ['user', 'official'] }
        }
      }
    },
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const { source } = request.body;
      try {
        const saved = await settingsDao.setLlmSource(userId, source);
        return reply.result.success(null, { llm_source: saved });
      } catch (e) {
        return reply.result.fail(e.message, null, 400);
      }
    }
  });
}

export default registerSettingsRoutes;
