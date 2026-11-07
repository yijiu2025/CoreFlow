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
 * 注意两个容易漏的"假 0"：`Number(null)` 与 `Number('   ')` 都等于 0，
 * 若不显式拦掉，一个写成 `null` 的配置会让超时保护静默消失 —— 正是本函数要防的事。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

/**
 * 解析毫秒级超时配置
 * 非数字 / 负数一律回退默认值 —— 静默退化成 0 会**关掉保护**，比配错更危险
 *
 * @param {string|number|undefined} raw - 配置原始值（环境变量或 app_config 字段）
 * @param {number} fallback - 默认值（毫秒）
 * @returns {number} 有效毫秒数（0 表示交给 Fastify 内置默认值）
 */
function resolveTimeoutMs(raw, fallback) {
  // 未配置：undefined / null / 空白串（'   ' 会被 Number() 算成 0）
  if (typeof raw !== 'number' && typeof raw !== 'string') return fallback;
  if (typeof raw === 'string' && raw.trim() === '') return fallback;

  const n = Number(raw);
  // NaN / Infinity（'abc'、'300ms' 都落这里）与负数一律回退，绝不落成 0
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export { resolveTimeoutMs };
