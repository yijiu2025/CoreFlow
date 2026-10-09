/**
 * RetroWeb LLM 凭据解析（算法中转的 LLM 路由口）
 *
 * 前端发 analyze / conditions / followup 时**不传凭据**（它也不该知道官方 key）。
 * 真正的「这次调用用哪套 LLM」由 Node 服务端按用户身份自动解析：
 *
 *   ① 先读用户 `llm_source` 偏好（settings.dao）：显式选「官方」则只走官方；
 *   ② 否则用户自建（owner=user）里激活的那套 —— 解密 keys（llm-profile.dao.activeForUser）；
 *   ③ 自建没有 → 官方 LLM（RETROWEB_OFFICIAL_LLM_ENABLED=true 时）—— 内存 keys 兜底；
 *   ④ 都没有 → 返回 null（不注入，Python 用自己 .env 兜底，老路径不破坏）。
 *
 * 🔴 返回的凭据里含明文 key，**只在 Node → Python 的内网转发里出现，永不出前端**。
 *    （前端发的 analyze 请求体里本来就没有凭据，注入发生在服务端转发前。）
 *
 * 🔴 官方 key 的「数量与值」都不出后端：这里解析出来只用于构造给 Python 的 profile，
 *    路由层拿到后直接塞进转发 body，不落日志、不写响应。
 *
 * @since 2026-10-09
 */
import llmProfileDao from '../dao/llm-profile.dao.js';
import settingsDao from '../dao/settings.dao.js';
import { officialEnabled, officialModelsInternal, officialKeys } from './official-llm.service.js';

/** 取某个官方模型的凭据（🔴 仅后端内部，明文 key 不出本文件） */
function officialCreds(official) {
  if (!official || !official.base_url || !official.model) return null;
  const keys = officialKeys(official.name);
  if (!keys.length) return null;
  return {
    base_url: official.base_url,
    api_keys: keys,
    model: official.model
  };
}

/**
 * 解析某用户这次 LLM 调用该用的凭据。
 *
 * @param {number} userId
 * @returns {Promise<{base_url: string, api_keys: string[], model: string} | null>}
 *   null = 未命中（既不注入，让 Python 兜底）
 */
async function resolveLlmCreds(userId) {
  // ① 用户显式选了「官方」⇒ 只走官方（不再回落自建）
  const source = await settingsDao.llmSource(userId);
  if (source === 'official' && officialEnabled()) {
    const official = officialModelsInternal().find(m => m.model);
    return officialCreds(official);
  }

  // ② 用户自建：激活的那套优先
  const active = await llmProfileDao.activeForUser(userId);
  if (active && active.base_url && active.model && active.keys?.length) {
    return {
      base_url: active.base_url,
      api_keys: active.keys,
      model: active.model
    };
  }

  // ③ 官方 LLM：启用时用第一个官方模型兜底（后续可扩展成按配额/负载选）
  if (officialEnabled()) {
    const creds = officialCreds(officialModelsInternal().find(m => m.model));
    if (creds) return creds;
  }

  return null;
}

/**
 * 给「要转发给 Python 的 LLM 请求体」注入凭据覆盖字段。
 *
 * @param {object} body 原请求体（前端 analyze/conditions/followup 的 body）
 * @param {object|null} creds resolveLlmCreds 的结果；null 则原样返回 body
 * @returns {object} 注入 `profile` 字段后的新 body
 */
function injectProfile(body, creds) {
  if (!creds) return body;
  return {
    ...body,
    // 🔴 字段名 `profile`，Python 侧 _llm_common_payload 白名单解析这三个字段
    profile: {
      base_url: creds.base_url,
      api_keys: creds.api_keys,
      model: creds.model
    }
  };
}

export { resolveLlmCreds, injectProfile };
