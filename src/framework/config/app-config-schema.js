/**
 * 应用级调优覆盖的 schema 校验（机制，不含默认值）
 *
 * 默认值归各 core 使用处（见 framework/config/app-config.js 头部的对照表），
 * 本文件只负责校验**用户写的覆盖**：
 *   - 未知配置段 / 配置项 → 疑似拼写错误（如漏写 `Ms` 后缀会静默失效）
 *   - 值域越界 / 非整数 → 提示已回退默认
 *
 * 只告警不阻断：调优覆盖不该有让服务起不来的能力。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

/** 每个数值项的合法区间（闭区间，毫秒/次） */
const NUMBER_RULES = [
  ['http.keepAliveTimeoutMs', 0, 3_600_000],
  ['http.requestTimeoutMs', 0, 3_600_000],
  ['websocket.shutdownGraceMs', 0, 600_000],
  ['guard.syncIntervalMs', 0, 3_600_000],
  ['monitor.slowRequestThresholdMs', 0, 3_600_000],
  ['passwordHash.scryptMaxConcurrency', 1, 1024],
  ['passwordHash.bcryptMaxConcurrency', 1, 1024]
];

/** 合法配置段 → 合法配置项（用于拼写错误诊断） */
const KNOWN_SECTIONS = {
  http: ['keepAliveTimeoutMs', 'requestTimeoutMs'],
  websocket: ['shutdownGraceMs'],
  guard: ['syncIntervalMs'],
  monitor: ['slowRequestThresholdMs'],
  passwordHash: ['scryptMaxConcurrency', 'bcryptMaxConcurrency']
};

/**
 * 校验用户写的覆盖对象
 *
 * @param {object} [config] - 待校验覆盖（通常来自 src/config/app_config.js）
 * @returns {string[]} 问题清单（人类可读）；空数组表示覆盖合法
 */
function validateAppConfig(config = {}) {
  const warnings = [];

  for (const [section, value] of Object.entries(config || {})) {
    const knownKeys = KNOWN_SECTIONS[section];
    if (!knownKeys) {
      warnings.push(`未知配置段 "${section}"（合法：${Object.keys(KNOWN_SECTIONS).join(' / ')}），已忽略`);
      continue;
    }
    for (const key of Object.keys(value || {})) {
      if (!knownKeys.includes(key)) {
        warnings.push(`未知配置项 "${section}.${key}"（合法：${knownKeys.join(' / ')}），已忽略 —— 疑似拼写错误`);
      }
    }
  }

  const get = path => path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), config);
  for (const [path, min, max] of NUMBER_RULES) {
    const raw = get(path);
    if (raw === undefined || raw === null || raw === '') continue; // 未设置走 core 保底
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      warnings.push(`"${path}" = ${JSON.stringify(raw)} 非法（需 ${min}~${max} 的整数），已回退默认值`);
    }
  }

  return warnings;
}

export { validateAppConfig, NUMBER_RULES, KNOWN_SECTIONS };
