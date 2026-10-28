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
      // 🔴 归属校验：传入当前登录用户，只允许轮询自己的 job（IDOR 修复）
      const snap = await jobDao.poll(id, since, request.state.user.userId);
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
      // 🔴 归属校验：传入当前登录用户，只允许取消自己的 job（IDOR 修复）
      const ok = await jobDao.cancel(id, request.state.user.userId);
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

  // ------------------------------------------------------------------------
  // 补齐转发的缺口（predict / llm 状态与端点 / feedback）
  //
  // 🔴 这一组是**为了把 VITE_RETRO_VIA_NODE=true 真正跑通**补的：前端构建时
  //    retroApi 的 baseURL 指向 /retroweb/v1，所有路径需求这一层都得有对应实现，
  //    少一个就是一个静默 404 —— 界面上表现为「点了没反应 / 面板空白」，
  //    而不是报错。下面每条都对应 Python app.py 里确实存在的 /api/... 端点。
  // ------------------------------------------------------------------------

  /**
   * 单步逆合成预测（**跟"搜到底"是两回事**：展开一个节点用这条，search 才是建整棵树）
   *
   * 之前只做了异步 job（predict 走 /jobs），而界面里的「手动展开某一步」
   * 打的是同步 /predict —— 缺了它，走 Node 中转时手动展开直接 404。
   */
  registerSecureRoute(fastify, {
    name: 'retroPredict',
    alias: '单步逆合成预测',
    method: 'POST',
    url: '/predict',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('POST', '/predict', request.body);
        if (!ok) return reply.result.fail(data?.error || '预测失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** LLM 面板状态（配置是否就绪、key 轮换状态等） */
  registerSecureRoute(fastify, {
    name: 'retroLlmStatus',
    alias: '大模型端点状态',
    method: 'GET',
    url: '/llm/status',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('GET', '/llm/status');
        if (!ok) return reply.result.fail(data?.error || '获取端点状态失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /**
   * 拉取可用模型清单 —— **必须带 profile 凭据**：
   * 各家的模型列表要用该企业的 key 去拉，转发时不注入 = 上游拿不到凭据。
   */
  registerSecureRoute(fastify, {
    name: 'retroLlmModels',
    alias: '拉取可用模型清单',
    method: 'POST',
    url: '/llm/models',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      const body = await withLlmProfile(request.state.user.userId, request.body);
      try {
        const { ok, status, data } = await forwardJson('POST', '/llm/models', body);
        if (!ok) return reply.result.fail(data?.error || '拉取模型清单失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /**
   * 拉取**当前生效配置**下的模型清单（前端没指定草稿时走这条 GET）。
   *
   * 🔴 不能真的把 GET 转发给 Python：Python 的 GET 分支取的是**进程级激活配置**
   *    （`_active_profile`），那是全进程共享的 —— 多用户并发时会串到别人那套上。
   *    所以这里内部改走 POST 转发：凭据仍由 `withLlmProfile` 按**当前用户**解析，
   *    语义与上面的 POST 完全一致（"看我这一套下有哪些模型"），只是省掉 body。
   */
  registerSecureRoute(fastify, {
    name: 'retroLlmModelsCurrent',
    alias: '拉取当前配置的可用模型清单',
    method: 'GET',
    url: '/llm/models',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.USE,
    handler: async (request, reply) => {
      const body = await withLlmProfile(request.state.user.userId, {});
      try {
        const { ok, status, data } = await forwardJson('POST', '/llm/models', body);
        if (!ok) return reply.result.fail(data?.error || '拉取模型清单失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /**
   * LLM 端点设置的读与写。
   *
   * 🔴 涉及密钥 ⇒ 用 LLM.CONFIG（high_risk）而不是 LLM.USE。
   *    写操作必须把 userId 交给下游做归属，避免 A 用户改到 B 的配置。
   */
  registerSecureRoute(fastify, {
    name: 'retroLlmSettings',
    alias: '读取大模型端点设置',
    method: 'GET',
    url: '/llm/settings',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    handler: async (request, reply) => {
      try {
        // 🔴 读取也按 user_id 隔离：此前 GET 不传用户标识，多用户会串读到他人端点配置（含密钥信息）。
        const { ok, status, data } = await forwardJson('GET', '/llm/settings', undefined, {
          user_id: request.state.user.userId
        });
        if (!ok) return reply.result.fail(data?.error || '读取端点设置失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  registerSecureRoute(fastify, {
    name: 'retroLlmSettingsSave',
    alias: '保存大模型端点设置',
    method: 'POST',
    url: '/llm/settings',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    handler: async (request, reply) => {
      const body = { ...(request.body ?? {}), user_id: request.state.user.userId };
      try {
        const { ok, status, data } = await forwardJson('POST', '/llm/settings', body);
        if (!ok) return reply.result.fail(data?.error || '保存端点设置失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** 切换当前生效的端点配置 */
  registerSecureRoute(fastify, {
    name: 'retroLlmSettingsActive',
    alias: '切换生效端点',
    method: 'POST',
    url: '/llm/settings/active',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    handler: async (request, reply) => {
      const body = { ...(request.body ?? {}), user_id: request.state.user.userId };
      try {
        const { ok, status, data } = await forwardJson('POST', '/llm/settings/active', body);
        if (!ok) return reply.result.fail(data?.error || '切换端点失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** 重置 key 轮换状态（某次 key 被打死后的手动恢复） */
  registerSecureRoute(fastify, {
    name: 'retroLlmKeysReset',
    alias: '重置密钥轮换状态',
    method: 'POST',
    url: '/llm/keys/reset',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.LLM.CONFIG,
    handler: async (request, reply) => {
      const body = { ...(request.body ?? {}), user_id: request.state.user.userId };
      try {
        const { ok, status, data } = await forwardJson('POST', '/llm/keys/reset', body);
        if (!ok) return reply.result.fail(data?.error || '重置失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  /** 反馈：提交（POST）与查看（GET）共用同一路径 */
  registerSecureRoute(fastify, {
    name: 'retroFeedback',
    alias: '提交反馈',
    method: 'POST',
    url: '/feedback',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.SUBMIT,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('POST', '/feedback', request.body);
        if (!ok) return reply.result.fail(data?.error || '提交反馈失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });

  registerSecureRoute(fastify, {
    name: 'retroFeedbackList',
    alias: '查看反馈',
    method: 'GET',
    url: '/feedback',
    requireLogin: true,
    permission: RETROWEB_PERMISSIONS.JOB.READ,
    handler: async (request, reply) => {
      try {
        const { ok, status, data } = await forwardJson('GET', '/feedback');
        if (!ok) return reply.result.fail(data?.error || '获取反馈失败', data, status);
        return reply.result.success(null, data);
      } catch (e) {
        return reply.result.fail(e.message, null, 503);
      }
    }
  });
}

export default registerComputeRoutes;
