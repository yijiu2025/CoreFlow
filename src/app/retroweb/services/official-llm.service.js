/**
 * RetroWeb 官方 LLM 配置服务
 *
 * 🔴 官方 LLM 的密钥**只存在服务端**（.env 注入 → 内存），**永不进用户表、永不回传前端**：
 *    · 前端只看到 `{ id, name, model, quota }`，token 的**数量与值都不出后端**；
 *    · 出接口时连 `key_count` 都不带，避免"能反推有几个 key"这种侧信道。
 *
 * 🔴 官方 LLM **暂不起用**（`RETROWEB_OFFICIAL_LLM_ENABLED !== 'true'`）：
 *    结构先落好，算法中转（S3）将来路由到官方 key 时再打开；现在 `officialModels()` 仍
 *    返回清单（供前端"官方模型"占位展示），但配额为 0、enabled=false。
 *
 * 官方模型列表用 `.env` 配置（逗号分隔的 `name|base_url|model|quota` 四元组），例如：
 *   RETROWEB_OFFICIAL_LLM_ENABLED=true
 *   RETROWEB_OFFICIAL_LLMS=官方GPT|https://api.x.ai/v1|gpt-4o|10000
 *   每个模型的密钥走 RETROWEB_OFFICIAL_KEY_<NAME>（内存读取，不落库、不回传）。
 *   🔴 base_url 也是官方凭据的一部分（key 得知道往哪个 OpenAI 兼容端点发），同样不出前端。
 *
 * @since 2026-10-09
 */

/** 是否启用官方 LLM（暂不起用） */
function officialEnabled() {
  return process.env.RETROWEB_OFFICIAL_LLM_ENABLED === 'true';
}

/**
 * 解析官方模型清单（每项 `name|base_url|model|quota`）
 * @returns {Array<{id: string, name: string, base_url: string, model: string, quota: number}>}
 */
function parseOfficialModels() {
  const raw = process.env.RETROWEB_OFFICIAL_LLMS || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map(seg => seg.trim())
    .filter(Boolean)
    .map((seg, i) => {
      const [name = '', baseUrl = '', model = '', quotaRaw = '0'] = seg.split('|').map(s => (s || '').trim());
      const quota = Number(quotaRaw);
      return {
        id: `official-${i + 1}`,
        name: name || `官方模型 ${i + 1}`,
        base_url: baseUrl,
        model,
        quota: Number.isFinite(quota) && quota > 0 ? quota : 0
      };
    })
    .filter(item => item.model);
}

/**
 * 官方模型清单（出给前端）。
 *
 * 🔴 只含 name / model / quota 三样，**刻意不含 token 数量与值，也不含 base_url**：
 *    base_url 同样是官方凭据的一部分（暴露端点地址等于告诉别人往哪打）。
 * @returns {Array<{id: string, name: string, model: string, quota: number, enabled: boolean}>}
 */
function officialModels() {
  return parseOfficialModels().map(({ id, name, model, quota }) => ({
    id,
    name,
    model,
    quota,
    enabled: officialEnabled()
  }));
}

/**
 * 官方模型完整形态（🔴 仅后端内部解析凭据用，永不回传）。
 * @returns {Array<{id: string, name: string, base_url: string, model: string, quota: number}>}
 */
function officialModelsInternal() {
  return parseOfficialModels();
}

/**
 * 取某个官方模型的密钥（🔴 仅后端内部用，永不回传）。
 * @param {string} name 官方模型名（与 .env 的 RETROWEB_OFFICIAL_KEY_<NAME> 对应）
 * @returns {string[]} 密钥列表（解密后的明文，仅供中转路由用）
 */
function officialKeys(name) {
  if (!name) return [];
  const raw = process.env[`RETROWEB_OFFICIAL_KEY_${name}`] || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export { officialEnabled, officialModels, officialModelsInternal, officialKeys };
