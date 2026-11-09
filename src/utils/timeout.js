/**
 * 超时配置解析
 *
 * 配置值可能来自环境变量（字符串）、JSON 配置（数字），也可能是手写的 `-1` / `abc` / `null`。
 * 统一在这里收敛成一个可用的整数毫秒值，避免每个消费点各写一遍 `Number()`。
 *
 * 判据的关键取舍：**非法值回退默认值，而不是退化成 0**。
 * `0` 在 Fastify 里意味着"用内置默认"，而某些场景下写成 0 等于把保护关掉 ——
 * 让配错的人拿到默认值（服务照常受保护），比让他拿到 0（保护静默消失）安全得多。
 * 与此同时合法的 `0` 必须原样保留，那是调用方显式表达"交给 Fastify 默认值"。
 *
 * 三个容易漏的"假 0"：`Number(null)`、`Number('   ')`、`Number(true)` 分别等于 0 / 0 / 1，
 * 若不显式拦掉，一个写成 `null` 的配置会让超时保护静默消失 —— 正是本函数要防的事。
 *
 * 为什么支持单位后缀（2026-11-09）：环境变量里写 `30s` / `5m` 比 `30000` 可读得多，
 * 而旧实现会把 `'30s'` 判成非法并**静默回退默认值** —— 配置者以为生效了，实际跑的是
 * 默认值，这类"改了没生效"最难查。现在 `ms|s|m|h` 都认，不认识的写法仍然回退（并保持可测）。
 *
 * 为什么必须有上界：Node 的定时器上限是 2^31-1 ms（约 24.8 天），超出会被 `TimeoutOverflowWarning`
 * 压成 **1ms** —— 想让超时"几乎不过期"的配置会瞬间变成"立刻超时"。这里直接钳到上限。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

/** Node 定时器/超时上限（2^31-1 ms）；超过会被压成 1ms，比"不设防"更危险 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** 单位 → 毫秒；缺省按毫秒 */
const UNIT_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

/** 允许 `30000` / `30000ms` / `30s` / `30 s` / `5m` / `1.5h`（单位大小写不敏感） */
const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i;

/**
 * 解析毫秒级超时配置
 *
 * - 未配置 / 非法值 / 负数 → 回退默认值（绝不让保护静默变成 0）
 * - 合法 `0` 原样保留（= 交给 Fastify 内置默认）
 * - 支持 `ms/s/m/h` 单位后缀
 * - 超过 2^31-1 钳到上限（否则 Node 会压成 1ms）
 *
 * @param {string|number|undefined} raw - 配置原始值（环境变量或 app_config 字段）
 * @param {number} fallback - 默认值（毫秒）
 * @returns {number} 有效毫秒数（0 表示交给 Fastify 内置默认值）
 */
function resolveTimeoutMs(raw, fallback) {
  if (typeof raw === 'number') {
    // NaN / Infinity 与负数一律回退，绝不落成 0
    if (!Number.isFinite(raw) || raw < 0) return fallback;
    return Math.min(Math.floor(raw), MAX_TIMEOUT_MS);
  }
  // 非字符串（undefined / null / boolean / object）按"未配置"处理
  if (typeof raw !== 'string') return fallback;

  const text = raw.trim();
  if (!text) return fallback;

  const matched = DURATION_RE.exec(text);
  // 'abc' / '-1' / '1e3' / '30days' 都落这里 —— 宁可回退默认值，也不猜
  if (!matched) return fallback;

  const value = Number(matched[1]);
  if (!Number.isFinite(value)) return fallback;

  const ms = Math.floor(value * UNIT_MS[(matched[2] || 'ms').toLowerCase()]);
  return Math.min(ms, MAX_TIMEOUT_MS);
}

export { MAX_TIMEOUT_MS, resolveTimeoutMs };
