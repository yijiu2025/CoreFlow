/**
 * RetroWeb 算法中转 API（S3）
 *
 * 前端不再直连 Python，改经 Node 中转（Node 做鉴权 + job 落库 + 配额）。
 * Python 从公网下线，只对内网可见（RETRO_PYTHON_URL）。
 *
 * 三类：
 *   · 同步转发：parse / depict / models / load / model-service / forward
 *   · 异步 job：predict / search（落库 + 轮询 + stale）
 *   · SSE 透传：analyze / conditions / followup
 *
 * 🔴 与数据类接口（tasks / llm-profiles）分开，因为这里每个口都吃算力，
 *    单独一组便于限流与审计（权限点 JOB.*）。
 *
 * @since 2026-10-09
 */
import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { RETROWEB_PERMISSIONS } from '../../../app/retroweb/permission/index.js';
import { forwardJson, forwardStream } from '../../../app/retroweb/services/upstream.service.js';
import { resolveLlmCreds, injectProfile } from '../../../app/retroweb/services/llm-route.service.js';
import jobDao from '../../../app/retroweb/dao/job.dao.js';

async function registerComputeRoutes(fastify) {
  registerGroupMetadata({
    name: 'compute',
    description: '算法服务中转（同步转发 / 异步 job / SSE 透传）',
    prefix: '/v1'
  });

  // ---------- 同步转发 ----------

  /** 结构解析（CDXML / SMILES / MOL） */
  registerSecureRoute(fastify, {
    name: 'retroParse',
    alias: '解析化学结构',
    method: 'POST',
    url: '/parse',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('POST', '/parse', request.body);
        if (!ok) return reply.result.fail(data?.error || '解析失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** 结构图渲染 */
  registerSecureRoute(fastify, {
    name: 'retroDepict',
    alias: '渲染结构图',
    method: 'POST',
    url: '/depict',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('POST', '/depict', request.body);
        if (!ok) return reply.result.fail(data?.error || '渲染失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** 模型状态矩阵 */
  registerSecureRoute(fastify, {
    name: 'retroModels',
    alias: '模型状态',
    method: 'GET',
    url: '/models',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.READ,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('GET', '/models');
        if (!ok) return reply.result.fail(data?.error || '获取模型失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** 加载模型 / 模型服务启停 / 正向模型加载（转发给上游） */
  registerSecureRoute(fastify, {
    name: 'retroLoadModel',
    alias: '加载模型',
    method: 'POST',
    url: '/load',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('POST', '/load', request.body);
        if (!ok) return reply.result.fail(data?.error || '加载模型失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  registerSecureRoute(fastify, {
    name: 'retroModelService',
    alias: '模型服务启停',
    method: 'POST',
    url: '/model-service/:action',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    schema: {
      params: {
        type: 'object',
        required: ['action'],
        properties: { action: { type: 'string', enum: ['start', 'stop', 'restart'] } }
      }
    },
    handler: async (request, reply) => {
      const { action } = request.params;
      try {
        const { ok, status, data } = await forwardJson('POST', `/model-service/${action}`, request.body);
        if (!ok) return reply.result.fail(data?.error || '操作失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  registerSecureRoute(fastify, {
    name: 'retroForwardLoad',
    alias: '加载正向模型',
    method: 'POST',
    url: '/forward/load',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('POST', '/forward/load', request.body);
        if (!ok) return reply.result.fail(data?.error || '加载正向模型失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  // ---------- 异步 job ----------
  // 🔴 契约与 Python 完全一致：提交回 {ok, job_id}（job_id=上游 provider_job_id）、
  //    轮询透传上游 JobSnapshot、取消 POST /jobs/:id/cancel。前端 retroApi 零改动。

  /** 提交 job（predict / search）：落库 + 原样透传 body 给上游 */
  registerSecureRoute(fastify, {
    name: 'retroSubmitJob',
    alias: '提交预测/搜索任务',
    method: 'POST',
    url: '/jobs',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      const userId = request.state.user.userId;
      const body = request.body ?? {};
      const { task_id, kind = 'predict', ...params } = body;
      const result = await jobDao.submit(userId, { taskId: task_id ?? null, kind, params });
      if (!result.ok) {
        return reply.result.fail(result.error || '提交失败', result, 502);
      }
      // 🔴 信封里 data 直接是 {ok, job_id}，前端拆包后与直连 Python 拿到的完全一样
      return reply.result.success(null, result);
    }
  });

  /** 轮询 job 进度/结果（透传上游快照；上游 404 ⇒ stale） */
  registerSecureRoute(fastify, {
    name: 'retroGetJob',
    alias: '查询任务进度',
    method: 'GET',
    url: '/jobs/:id',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.READ,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      },
      querystring: {
        type: 'object',
        properties: { since: { type: 'integer', minimum: 0, default: 0 } }
      }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { since } = request.query;
      const snap = await jobDao.poll(id, since);
      return reply.result.success(null, snap);
    }
  });

  /** 取消 job（透传上游 cancel） */
  registerSecureRoute(fastify, {
    name: 'retroCancelJob',
    alias: '取消任务',
    method: 'POST',
    url: '/jobs/:id/cancel',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.CANCEL,
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const ok = await jobDao.cancel(id);
      if (!ok) return reply.result.notFound('任务不存在');
      return reply.result.success(null, { ok: true });
    }
  });

  // ---------- SSE 透传 ----------
  // 🔴 路径与前端 retroApi 完全一致（`/llm/<x>/stream`），Node 原样透传给上游，
  //    前端切 baseURL 即可、路径不用改；上游 Python 也是这些路径。
  // 🔴 LLM 凭据在转发前由 Node 解析注入（用户自建 → 官方 → 不注入），
  //    前端不传、也不该知道官方 key。

  /**
   * 解析并注入 LLM 凭据：返回转发给上游的请求体。
   * @param {number} userId
   * @param {object} body
   * @returns {Promise<object>}
   */
  async function withLlmProfile(userId, body) {
    const creds = await resolveLlmCreds(userId);
    return injectProfile(body ?? {}, creds);
  }

  /** AI 工艺分析（流式） */
  registerSecureRoute(fastify, {
    name: 'retroAnalyze',
    alias: 'AI 工艺分析',
    method: 'POST',
    url: '/llm/analyze/stream',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      const body = await withLlmProfile(request.state.user.userId, request.body);
      return await forwardStream(fastify, reply, '/llm/analyze/stream', body);
    }
  });

  /** 候选条件枚举（流式） */
  registerSecureRoute(fastify, {
    name: 'retroConditions',
    alias: '候选条件枚举',
    method: 'POST',
    url: '/llm/conditions/stream',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      const body = await withLlmProfile(request.state.user.userId, request.body);
      return await forwardStream(fastify, reply, '/llm/conditions/stream', body);
    }
  });

  /** 追问（流式） */
  registerSecureRoute(fastify, {
    name: 'retroFollowup',
    alias: '追问',
    method: 'POST',
    url: '/llm/followup/stream',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      const body = await withLlmProfile(request.state.user.userId, request.body);
      return await forwardStream(fastify, reply, '/llm/followup/stream', body);
    }
  });

  // ---------- 非流式 LLM 兜底（analyze 同步版） ----------
  registerSecureRoute(fastify, {
    name: 'retroAnalyzeSync',
    alias: 'AI 工艺分析（非流式）',
    method: 'POST',
    url: '/llm/analyze',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      const body = await withLlmProfile(request.state.user.userId, request.body);
      try {
        const { ok, status, data } = await forwardJson('POST', '/llm/analyze', body);
        if (!ok) return reply.result.fail(data?.error || '分析失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });
}

export default registerComputeRoutes;
